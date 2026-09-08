import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("product_id");
    const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
    const questions = await prisma.question.findMany({
      where: { ...(shop ? { shop } : {}), ...(productId ? { productId } : {}), status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, question: true, answer: true, asker: true, createdAt: true, answeredAt: true },
    });
    return json({ count: questions.length, questions }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("[api.questions] loader failed", error);
    return json({ count: 0, questions: [], error: "Questions are temporarily unavailable." }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
};

export const action = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const formData = await request.formData();
    const productId = url.searchParams.get("product_id");
    const question = formData.get("question");
    const asker = formData.get("asker");
    if (!productId || !question || !asker) {
      return json({ error: "A product, your name, and a question are required." }, { status: 400 });
    }
    const created = await prisma.question.create({ data: {
      shop: url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "unknown",
      productId,
      productName: formData.get("product_name") || "Product question",
      question,
      asker,
      email: formData.get("email") || null,
      status: "PENDING",
    } });
    return json({ question: { id: created.id, status: created.status } }, { status: 201 });
  } catch (error) {
    console.error("[api.questions] action failed", error);
    return json({ error: "Something went wrong submitting your question. Please try again." }, { status: 500 });
  }
};
