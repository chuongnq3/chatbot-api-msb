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

import OpenAI from 'openai'; // Make sure to install: npm install openai

export const config = {
    runtime: "nodejs",
    maxDuration: 60 // Increased timeout for potentially longer streams
};

export default async function handler(req, res) {
    /* ------------------------ CORS & pre-flight ------------------------ */
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    /* --------------------------- Validate env -------------------------- */
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const openai = new OpenAI({ apiKey });

    /* --------------------------- Validate body ------------------------- */
    const {
        userText,
        thread_id: oldThread,
        assistant_id,
        file_ids = [],
        stream = false // New flag for streaming
    } = req.body ?? {};

    if (typeof userText !== "string" || !userText.trim()) {
        return res.status(400).json({ error: "Missing or invalid userText" });
    }
    if (!assistant_id) {
        return res.status(400).json({ error: "Missing assistant_id" });
    }

    /* ------------------------------ Logic ------------------------------ */
    let thread_id = oldThread;
    let messageText = ''; // To accumulate streamed content

    // Set headers for Server-Sent Events (SSE) if streaming is requested
    if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
    }

    try {
        /* 1. Tạo thread nếu chưa có */
        if (!thread_id) {
            const thread = await openai.beta.threads.create();
            thread_id = thread.id;
            // Send thread_id back immediately if streaming, otherwise at the end
            if (stream) {
                res.write(`data: ${JSON.stringify({ thread_id })}\n\n`);
            }
        }

        /* 2. Gửi message của user vào thread */
        const attachments =
            Array.isArray(file_ids) && file_ids.length
                ? file_ids.map((id) => ({
                    file_id: id,
                    tools: [{ type: "file_search" }]
                }))
                : undefined;

        await openai.beta.threads.messages.create(
            thread_id,
            {
                role: "user",
                content: userText,
                ...(attachments && { attachments })
            }
        );

        /* 3. Tạo run cho assistant (streaming) */
        const run = openai.beta.threads.runs.stream(
            thread_id,
            {
                assistant_id,
                instructions: "Trả lời ngắn gọn, đúng số liệu, bằng tiếng Việt."
            }
        );

        // Event handling for streaming
        for await (const event of run) {
            if (event.event === 'thread.message.delta') {
                const content = event.data.delta.content?.[0];
                if (content?.type === 'text' && content.text?.value) {
                    messageText += content.text.value;
                    if (stream) {
                        // Send partial reply immediately
                        res.write(`data: ${JSON.stringify({ reply_chunk: content.text.value })}\n\n`);
                    }
                }
            } else if (event.event === 'thread.run.completed') {
                // If not streaming, we'd fetch the final message here.
                // For streaming, we've already built messageText.
            }
            // You can add more event handling here for different event types
            // e.g., 'thread.tool.steps.delta' for tool calls
        }

        // Final response logic (non-streaming or after streaming is done)
        if (!stream) {
            // For non-streaming requests, fetch the last message
            const messages = await openai.beta.threads.messages.list(
                thread_id, { limit: 1 }
            );
            const reply = messages.data?.[0]?.content?.[0]?.text?.value ??
                "Xin lỗi, mình chưa có thông tin để trả lời.";
            return res.status(200).json({ reply, thread_id });
        } else {
            // For streaming, send a DONE signal at the end
            res.write(`data: [DONE]\n\n`);
            res.end(); // End the response for streaming
        }

    } catch (err) {
        console.error("GPT Error:", err);
        if (stream) {
            res.write(`data: ${JSON.stringify({ error: "GPT Error", detail: err.message ?? String(err) })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            res.end();
        } else {
            return res
                .status(500)
                .json({ error: "GPT Error", detail: err.message ?? String(err) });
        }
    }
}

