import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Page,
  ResourceItem,
  ResourceList,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const questions = await prisma.question.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" } });
  return json({ questions });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id");
  const question = await prisma.question.findFirst({ where: { id, shop: session.shop } });
  if (!question) return json({ error: "Question not found." }, { status: 404 });
  if (intent === "answer") {
    await prisma.question.update({ where: { id }, data: { answer: formData.get("answer") || "", status: "PUBLISHED", answeredAt: new Date() } });
  }
  if (intent === "reject") {
    await prisma.question.update({ where: { id }, data: { status: "REJECTED" } });
  }
  return json({ ok: true });
};

function statusTone(status) {
  if (status === "PUBLISHED") return "success";
  if (status === "REJECTED") return "critical";
  return "attention";
}

function statusLabel(status) {
  if (status === "PUBLISHED") return "Published";
  if (status === "REJECTED") return "Rejected";
  return "Needs an answer";
}

function QuestionRow({ question }) {
  const answerFetcher = useFetcher();
  const rejectFetcher = useFetcher();
  return (
    <ResourceItem id={question.id}>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
          <div>
            <Text as="h3" variant="headingMd">{question.productName}</Text>
            <Text as="p">&quot;{question.question}&quot;</Text>
            <Text as="p" tone="subdued">{question.asker}{question.email ? ` · ${question.email}` : ""}</Text>
          </div>
          <Badge tone={statusTone(question.status)}>{statusLabel(question.status)}</Badge>
        </InlineStack>
        {question.status !== "REJECTED" ? (
          <answerFetcher.Form method="post">
            <input type="hidden" name="intent" value="answer" />
            <input type="hidden" name="id" value={question.id} />
            <BlockStack gap="200">
              <TextField label="Your answer" labelHidden name="answer" defaultValue={question.answer || ""} multiline={2} autoComplete="off" placeholder="Type an answer to publish it on the product page" />
              <InlineStack gap="200">
                <Button submit variant="primary">{question.status === "PUBLISHED" ? "Update answer" : "Publish answer"}</Button>
                {question.status === "PENDING" ? (
                  <rejectFetcher.Form method="post">
                    <input type="hidden" name="intent" value="reject" />
                    <input type="hidden" name="id" value={question.id} />
                    <Button submit>Reject</Button>
                  </rejectFetcher.Form>
                ) : null}
              </InlineStack>
            </BlockStack>
          </answerFetcher.Form>
        ) : null}
      </BlockStack>
    </ResourceItem>
  );
}

export default function Questions() {
  const { questions } = useLoaderData();
  const pending = questions.filter((question) => question.status === "PENDING");

  return (
    <Page>
      <TitleBar title="Questions & Answers" />
      <Card padding="0">
        <div className="reviewloom-section-heading">
          <div>
            <Text as="h2" variant="headingLg">Customer questions</Text>
            <Text as="p" tone="subdued">Answer a question to publish it on the product page. Rejecting hides it from the storefront.</Text>
          </div>
          <Badge tone={pending.length ? "attention" : "success"}>{pending.length ? `${pending.length} to answer` : "All caught up"}</Badge>
        </div>
        <Divider />
        {questions.length ? (
          <ResourceList resourceName={{ singular: "question", plural: "questions" }} items={questions} renderItem={(question) => <QuestionRow question={question} />} />
        ) : (
          <div className="reviewloom-section-heading"><Text as="p" tone="subdued">No questions yet. They'll show up here as customers ask them on your product pages.</Text></div>
        )}
      </Card>
    </Page>
  );
}
