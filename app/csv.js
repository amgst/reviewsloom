export const REQUIRED_COLUMNS = [
  "product_id",
  "product_name",
  "reviewer",
  "rating",
  "body",
];

export function parseCsv(text) {
  if (text.length > 2_000_000)
    return { rows: [], errors: ["CSV must be smaller than 2 MB."] };
  const records = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  const push = () => {
    row.push(cell.trim());
    cell = "";
    closed = false;
  };
  const endRow = () => {
    push();
    if (row.some(Boolean)) records.push(row);
    row = [];
  };
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"' && !cell.trim() && !closed) quoted = true;
    else if (char === ",") push();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else if ((closed && char.trim()) || char === '"')
      return { rows: [], errors: ["CSV contains a misplaced quote."] };
    else if (!closed) cell += char;
  }
  if (quoted)
    return { rows: [], errors: ["CSV has an unclosed quoted field."] };
  if (cell || row.length || closed) endRow();
  if (!records.length)
    return { rows: [], errors: ["Paste a CSV with a header and review rows."] };
  if (records.length > 501)
    return { rows: [], errors: ["Import up to 500 reviews at a time."] };
  const header = records.shift().map((v) => v.toLowerCase());
  if (header.some((name) => ![...REQUIRED_COLUMNS, "image_url"].includes(name)))
    return {
      rows: [],
      errors: [
        "Use only product_id, product_name, reviewer, rating, body and optional image_url columns. Remove email and other unsupported columns before uploading.",
      ],
    };
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length || new Set(header).size !== header.length)
    return {
      rows: [],
      errors: [
        missing.length
          ? `Missing required columns: ${missing.join(", ")}`
          : "CSV headers must be unique.",
      ],
    };
  const rows = [],
    errors = [];
  records.forEach((cells, index) => {
    const row = Object.fromEntries(
      header.map((key, i) => [
        key,
        (cells[i] || "").replace(/^'(?=[=+\-@])/, ""),
      ]),
    );
    const rating = Number(row.rating);
    let imageUrl = null;
    try {
      if (row.image_url) {
        const url = new URL(row.image_url);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error();
        imageUrl = url.toString();
      }
    } catch {
      errors.push(`Row ${index + 2}: photo URL must use HTTPS.`);
      return;
    }
    if (
      cells.length !== header.length ||
      REQUIRED_COLUMNS.some((key) => !row[key]) ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      row.body.length > 5000 ||
      row.reviewer.length > 100 ||
      row.product_name.length > 300 ||
      row.product_id.length > 100
    ) {
      errors.push(
        `Row ${index + 2}: check required fields, field lengths, column count, and rating (1–5).`,
      );
      return;
    }
    rows.push({
      productId: row.product_id,
      productName: row.product_name,
      reviewer: row.reviewer,
      rating,
      body: row.body,
      imageUrl,
      status: "PENDING",
      source: "import",
    });
  });
  return { rows, errors };
}

export function toCsvValue(value) {
  let text = value == null ? "" : String(value);
  // Spreadsheet programs can execute formulas in CSV cells.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
