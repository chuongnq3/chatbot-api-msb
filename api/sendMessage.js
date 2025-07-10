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
    runtime: "nodejs",
    maxDuration: 60
};

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Missing OPENAI_API_KEY"); // Log lỗi thiếu API Key
        return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const {
        userText,
        thread_id: oldThread,
        assistant_id,
        file_ids = [],
        stream = false
    } = req.body ?? {};

    console.log("Received request with:", { userText, oldThread, assistant_id, stream }); // Log dữ liệu đầu vào

    if (typeof userText !== "string" || !userText.trim()) {
        return res.status(400).json({ error: "Missing or invalid userText" });
    }
    if (!assistant_id) {
        return res.status(400).json({ error: "Missing assistant_id" });
    }

    let thread_id = oldThread;

    if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        console.log("Streaming headers set."); // Log khi headers được set
    }

    try {
        /* 1. Tạo thread nếu chưa có */
        if (!thread_id) {
            console.log("Creating new thread...");
            const threadRes = await fetch("https://api.openai.com/v1/threads", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                },
                body: "{}"
            });

            if (!threadRes.ok) {
                const errorText = await threadRes.text();
                console.error(`Create thread failed: ${threadRes.status} ${errorText}`); // Log lỗi tạo thread
                throw new Error(
                    `Create thread failed: ${threadRes.status} ${errorText}`
                );
            }
            const { id } = await threadRes.json();
            thread_id = id;
            console.log("Thread created:", thread_id); // Log thread ID

            if (stream) {
                res.write(`data: ${JSON.stringify({ thread_id })}\n\n`);
                console.log("Thread ID streamed to client.");
            }
        } else {
            console.log("Using existing thread:", thread_id);
        }

        /* 2. Gửi message của user vào thread */
        const attachments =
            Array.isArray(file_ids) && file_ids.length
                ? file_ids.map((id) => ({
                    file_id: id,
                    tools: [{ type: "file_search" }]
                }))
                : undefined;

        console.log("Sending message to thread...");
        const msgRes = await fetch(
            `https://api.openai.com/v1/threads/${thread_id}/messages`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                },
                body: JSON.stringify({
                    role: "user",
                    content: userText,
                    ...(attachments && { attachments })
                })
            }
        );

        if (!msgRes.ok) {
            const errorText = await msgRes.text();
            console.error(`Create message failed: ${msgRes.status} ${errorText}`); // Log lỗi gửi message
            throw new Error(
                `Create message failed: ${msgRes.status} ${errorText}`
            );
        }
        console.log("Message sent to thread.");

        /* 3. Tạo run cho assistant và xử lý streaming */
        console.log("Creating run for assistant...");
        const runRes = await fetch(
            `https://api.openai.com/v1/threads/${thread_id}/runs`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                },
                body: JSON.stringify({
                    assistant_id,
                    instructions: "Trả lời ngắn gọn, đúng số liệu, bằng tiếng Việt.",
                    stream: true // Kích hoạt streaming từ OpenAI
                })
            }
        );

        if (!runRes.ok) {
            const errorText = await runRes.text();
            console.error(`Create run failed: ${runRes.status} ${errorText}`); // Log lỗi tạo run
            throw new Error(
                `Create run failed: ${runRes.status} ${errorText}`
            );
        }
        console.log("Run created. Starting to read stream...");

        if (stream) {
            const reader = runRes.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedData = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log("Stream from OpenAI finished."); // Log khi luồng kết thúc
                    break;
                }

                accumulatedData += decoder.decode(value, { stream: true });
                console.log("Accumulated data:", accumulatedData); // Log dữ liệu tích lũy

                let startIndex = 0;
                let newlineIndex;

                while ((newlineIndex = accumulatedData.indexOf('\n', startIndex)) !== -1) {
                    const line = accumulatedData.substring(startIndex, newlineIndex).trim();
                    console.log("Processing line:", line); // Log từng dòng được xử lý

                    if (line.startsWith('data:')) {
                        const dataString = line.substring(5).trim();
                        console.log("Parsed dataString:", dataString); // Log dataString
                        try {
                            const parsedData = JSON.parse(dataString);
                            // Kiểm tra xem parsedData có phải là một delta message không
                            if (parsedData.event === 'thread.message.delta' && parsedData.data.delta.content?.[0]?.type === 'text' && parsedData.data.delta.content?.[0]?.text?.value) {
                                const replyChunk = parsedData.data.delta.content[0].text.value;
                                console.log("Extracted replyChunk:", replyChunk); // Log chunk văn bản
                                res.write(`data: ${JSON.stringify({ reply_chunk: replyChunk })}\n\n`);
                            } else if (parsedData.event === 'thread.run.completed') {
                                // Nếu nhận được sự kiện run completed, có thể gửi một chunk rỗng hoặc tín hiệu kết thúc nếu cần
                                console.log("Run completed event received.");
                            }
                            // Bạn có thể xử lý các loại sự kiện khác nếu muốn
                        } catch (e) {
                            console.error("Error parsing JSON from stream line:", e, "Line:", line); // Log lỗi parsing JSON
                        }
                    } else if (line === '[DONE]') {
                        console.log("[DONE] signal received."); // Log tín hiệu DONE
                        res.write('data: [DONE]\n\n');
                        res.end();
                        return;
                    }
                    startIndex = newlineIndex + 1;
                }
                accumulatedData = accumulatedData.substring(startIndex);
            }
            // Nếu luồng kết thúc mà không có [DONE] rõ ràng
            console.log("Stream ended without explicit [DONE]. Sending final [DONE].");
            res.write('data: [DONE]\n\n');
            res.end();

        } else {
            // Logic non-streaming cũ (poll tới khi run hoàn thành)
            // ... (giữ nguyên code cũ nếu bạn vẫn muốn hỗ trợ non-streaming)
            const { id: run_id } = await runRes.json();
            let status = "queued";
            console.log("Non-streaming: Polling run status...");
            while (status !== "completed") {
                await new Promise((r) => setTimeout(r, 1000));
                const checkRes = await fetch(
                    `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                            "OpenAI-Beta": "assistants=v2"
                        }
                    }
                );

                const check = await checkRes.json();
                status = check.status;
                console.log("Polling status:", status);

                if (["failed", "cancelled", "expired"].includes(status)) {
                    throw new Error(`Run ended with status: ${status}`);
                }
            }

            console.log("Run completed. Fetching last message...");
            const lastMsgRes = await fetch(
                `https://api.openai.com/v1/threads/${thread_id}/messages?limit=1`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "OpenAI-Beta": "assistants=v2"
                    }
                }
            );
            const { data } = await lastMsgRes.json();

            const reply =
                data?.[0]?.content?.[0]?.text?.value ??
                "Xin lỗi, mình chưa có thông tin để trả lời.";
            console.log("Final reply (non-streaming):", reply);
            return res.status(200).json({ reply, thread_id });
        }

    } catch (err) {
        console.error("GPT Error in catch block:", err); // Log lỗi chung
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
