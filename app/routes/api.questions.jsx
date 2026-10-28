import { json } from "@remix-run/node";
import prisma from "../db.server";
import {
  storefrontContext,
  limitStorefront,
  textField,
  emailAddress,
} from "../security.server";

export const loader = async ({ request }) => {
  const { shop } = await storefrontContext(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  if (!productId || productId.length > 100)
    return json({ error: "A product is required." }, { status: 400 });
  const limit = Math.min(
    50,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 20)),
  );
  const questions = await prisma.question.findMany({
    where: { shop, productId, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      question: true,
      answer: true,
      asker: true,
      createdAt: true,
      answeredAt: true,
    },
  });
  return json(
    { count: questions.length, questions },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
};

export const action = async ({ request }) => {
  const { shop } = await storefrontContext(request);
  await limitStorefront(request, shop, "question");
  const data = await request.formData();
  const productId = new URL(request.url).searchParams.get("product_id");
  if (!productId || productId.length > 100)
    return json({ error: "A product is required." }, { status: 400 });
  const email = textField(data, "email", 254);
  if (email && !emailAddress(email))
    return json({ error: "Enter a valid email." }, { status: 400 });
  const question = await prisma.question.create({
    data: {
      shop,
      productId,
      productName: textField(data, "product_name", 300) || "Product question",
      question: textField(data, "question", 3000, true),
      asker: textField(data, "asker", 100, true),
      email: email || null,
      status: "PENDING",
    },
  });
  return json(
    { question: { id: question.id, status: question.status } },
    { status: 201 },
  );
};
