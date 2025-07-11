/**
 * /api/sendMessage.js
 * -------------------
 * Serverless function gọi OpenAI Assistants v2 và trả về câu trả lời.
 * - Cho phép CORS để gọi từ domain tĩnh (GitHub Pages, Netlify…)
 * - Bắt OPTIONS pre-flight tránh crash "req.body undefined"
 * - Kiểm tra method, input và env
 * - Poll run cho tới khi "completed"
 */

// export const config = {
//   runtime: "nodejs",   // dùng Node runtime (không phải Edge) để thoải mái import lib
//   maxDuration: 30      // tăng timeout mặc định 10s nếu cần
// };

// export default async function handler(req, res) {
//   /* ------------------------ CORS & pre-flight ------------------------ */
//   res.setHeader("Access-Control-Allow-Origin", "*");  // hoặc whitelist domain của bạn
//   res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
//   res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

//   if (req.method === "OPTIONS") {
//     return res.status(200).end();                      // dừng sớm cho pre-flight
//   }

//   if (req.method !== "POST") {
//     return res.status(405).json({ error: "Method Not Allowed" });
//   }

//   /* --------------------------- Validate env -------------------------- */
//   const apiKey = process.env.OPENAI_API_KEY;
//   if (!apiKey) {
//     return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
//   }

//   /* --------------------------- Validate body ------------------------- */
//   const {
//     userText,
//     thread_id: oldThread,
//     assistant_id,
//     file_ids = []
//   } = req.body ?? {};

//   if (typeof userText !== "string" || !userText.trim()) {
//     return res.status(400).json({ error: "Missing or invalid userText" });
//   }
//   if (!assistant_id) {
//     return res.status(400).json({ error: "Missing assistant_id" });
//   }

//   /* ------------------------------ Logic ------------------------------ */
//   try {
//     let thread_id = oldThread;

//     /* 1. Tạo thread nếu chưa có */
//     if (!thread_id) {
//       const threadRes = await fetch("https://api.openai.com/v1/threads", {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "Content-Type": "application/json",
//           "OpenAI-Beta": "assistants=v2"
//         },
//         body: "{}"
//       });

//       if (!threadRes.ok) {
//         throw new Error(
//           `Create thread failed: ${threadRes.status} ${await threadRes.text()}`
//         );
//       }
//       const { id } = await threadRes.json();
//       thread_id = id;
//     }

//     /* 2. Gửi message của user vào thread */
//     const attachments =
//       Array.isArray(file_ids) && file_ids.length
//         ? file_ids.map((id) => ({
//             file_id: id,
//             tools: [{ type: "file_search" }]
//           }))
//         : undefined;

//     const msgRes = await fetch(
//       `https://api.openai.com/v1/threads/${thread_id}/messages`,
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "Content-Type": "application/json",
//           "OpenAI-Beta": "assistants=v2"
//         },
//         body: JSON.stringify({
//           role: "user",
//           content: userText,
//           ...(attachments && { attachments })
//         })
//       }
//     );

//     if (!msgRes.ok) {
//       throw new Error(
//         `Create message failed: ${msgRes.status} ${await msgRes.text()}`
//       );
//     }

//     /* 3. Tạo run cho assistant */
//     const runRes = await fetch(
//       `https://api.openai.com/v1/threads/${thread_id}/runs`,
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "Content-Type": "application/json",
//           "OpenAI-Beta": "assistants=v2"
//         },
//         body: JSON.stringify({
//           assistant_id,
//           instructions: "Trả lời ngắn gọn, đúng số liệu, bằng tiếng Việt."
//         })
//       }
//     );

//     if (!runRes.ok) {
//       throw new Error(
//         `Create run failed: ${runRes.status} ${await runRes.text()}`
//       );
//     }

//     const { id: run_id } = await runRes.json();

//     /* 4. Poll tới khi run hoàn thành */
//     let status = "queued";
//     while (status !== "completed") {
//       await new Promise((r) => setTimeout(r, 1000));
//       const checkRes = await fetch(
//         `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`,
//         {
//           headers: {
//             Authorization: `Bearer ${apiKey}`,
//             "OpenAI-Beta": "assistants=v2"
//           }
//         }
//       );

//       const check = await checkRes.json();
//       status = check.status;

//       if (["failed", "cancelled", "expired"].includes(status)) {
//         throw new Error(`Run ended with status: ${status}`);
//       }
//     }

//     /* 5. Lấy message cuối cùng của assistant */
//     const lastMsgRes = await fetch(
//       `https://api.openai.com/v1/threads/${thread_id}/messages?limit=1`,
//       {
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           "OpenAI-Beta": "assistants=v2"
//         }
//       }
//     );
//     const { data } = await lastMsgRes.json();

//     const reply =
//       data?.[0]?.content?.[0]?.text?.value ??
//       "Xin lỗi, mình chưa có thông tin để trả lời.";

//     /* 6. Trả về client */
//     return res.status(200).json({ reply, thread_id });
//   } catch (err) {
//     console.error("GPT Error:", err);
//     return res
//       .status(500)
//       .json({ error: "GPT Error", detail: err.message ?? String(err) });
//   }
// }

export const config = {
  runtime: "nodejs20.x", // Node 20 Isolate (cold‑start < 100 ms)
  maxDuration: 30        // giây
};

/**
 * Simple helper: sleep(ms)
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  /* --------------------- CORS & pre‑flight --------------------- */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  /* --------------------- Env & input check -------------------- */
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  const { userText, thread_id: oldThread, assistant_id, file_ids } = req.body ?? {};
  if (typeof userText !== "string" || !userText.trim())
    return res.status(400).json({ error: "Missing or invalid userText" });

  // Ưu tiên ASSISTANT_ID/FILE_IDS lấy từ env để không lộ phía FE
  const ASSISTANT_ID = process.env.ASSISTANT_ID || assistant_id;
  if (!ASSISTANT_ID) return res.status(400).json({ error: "Missing assistant_id" });
  const FILE_IDS = process.env.FILE_IDS ? process.env.FILE_IDS.split(",") : file_ids ?? [];

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const isStream = urlObj.searchParams.get("stream") === "1";

  try {
    /* 1. Lấy hoặc tạo thread */
    let threadId = oldThread;
    if (!threadId) {
      const thrRes = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        },
        body: "{}"
      });
      if (!thrRes.ok)
        throw new Error(`Create thread failed: ${thrRes.status} ${await thrRes.text()}`);
      threadId = (await thrRes.json()).id;
    }

    /* 2. Push user message */
    const attachments = FILE_IDS.length
      ? FILE_IDS.map((id) => ({ file_id: id, tools: [{ type: "file_search" }] }))
      : undefined;

    const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({ role: "user", content: userText, ...(attachments && { attachments }) })
    });
    if (!msgRes.ok)
      throw new Error(`Create message failed: ${msgRes.status} ${await msgRes.text()}`);

    /* 3. Tạo run */
    if (isStream) {
      // 3A. Streaming SSE về FE
      const runStream = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        },
        body: JSON.stringify({ assistant_id: ASSISTANT_ID, stream: true, instructions: "Trả lời ngắn gọn, đúng số liệu, bằng tiếng Việt." })
      });
      if (!runStream.ok)
        throw new Error(`Create run failed: ${runStream.status} ${await runStream.text()}`);

      // === Pipe OpenAI SSE ➜ client ===
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });
      res.flushHeaders();
      // Gửi meta trước
      res.write(`event: thread\ndata: {"thread_id":"${threadId}"}\n\n`);

      for await (const chunk of runStream.body) {
        res.write(chunk);
      }
      // Đảm bảo FE biết stream kết thúc
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // 3B. Không stream – đợi hoàn tất (poll nhẹ)
    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({ assistant_id: ASSISTANT_ID, stream: false, instructions: "Trả lời ngắn gọn, đúng số liệu, bằng tiếng Việt." })
    });
    if (!runRes.ok)
      throw new Error(`Create run failed: ${runRes.status} ${await runRes.text()}`);

    const { id: runId, status: initStatus } = await runRes.json();
    let status = initStatus;
    let attempts = 0;
    while (status !== "completed" && attempts < 30) {
      await wait(1000);
      attempts++;
      const check = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2"
        }
      });
      const json = await check.json();
      status = json.status;
      if (["failed", "cancelled", "expired"].includes(status))
        throw new Error(`Run ended with status: ${status}`);
    }
    if (status !== "completed") throw new Error("Timeout waiting for run to complete");

    /* 4. Lấy message trả lời cuối */
    const lastMsg = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });
    const { data } = await lastMsg.json();
    const reply = data?.[0]?.content?.[0]?.text?.value ?? "Xin lỗi, mình chưa có thông tin.";

    return res.status(200).json({ reply, thread_id: threadId });
  } catch (err) {
    console.error("GPT Error:", err);
    if (isStream) {
      res.writeHead(500, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache"
      });
      res.write(`event: error\ndata: {"message":"${err.message ?? String(err)}"}\n\n`);
      return res.end();
    }
    return res.status(500).json({ error: "GPT Error", detail: err.message ?? String(err) });
  }
}



