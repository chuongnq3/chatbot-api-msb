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

// api/sendMessage.js

export const config = {
    runtime: "nodejs",
    maxDuration: 60 // Tăng timeout cho luồng dữ liệu dài
};

export default async function handler(req, res) {
    /* ------------------------ CORS & pre-flight ------------------------ */
    res.setHeader("Access-Control-Allow-Origin", "*"); // Hoặc whitelist domain của bạn
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        return res.status(200).end(); // Dừng sớm cho pre-flight
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    /* --------------------------- Validate env -------------------------- */
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Missing OPENAI_API_KEY environment variable.");
        return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    /* --------------------------- Validate body ------------------------- */
    const {
        userText,
        thread_id: oldThread,
        assistant_id,
        file_ids = [],
        stream = false // Cờ yêu cầu streaming từ frontend
    } = req.body ?? {};

    if (typeof userText !== "string" || !userText.trim()) {
        console.error("Invalid userText:", userText);
        return res.status(400).json({ error: "Missing or invalid userText" });
    }
    if (!assistant_id) {
        console.error("Missing assistant_id.");
        return res.status(400).json({ error: "Missing assistant_id" });
    }

    let thread_id = oldThread;
    console.log(`Request received: userText='${userText}', thread_id='${thread_id}', assistant_id='${assistant_id}', stream=${stream}`);

    // Thiết lập headers cho Server-Sent Events (SSE) nếu yêu cầu streaming
    if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // Để ngăn Vercel đóng kết nối quá sớm khi streaming
        res.write(':\n\n'); // Gửi một comment SSE để keep-alive (hoặc đảm bảo kết nối mở)
        console.log("SSE headers set for streaming response.");
    }

    try {
        /* 1. Tạo thread nếu chưa có */
        if (!thread_id) {
            console.log("No existing thread_id. Creating a new thread...");
            const threadRes = await fetch("https://api.openai.com/v1/threads", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2" // Quan trọng cho Assistants API
                },
                body: "{}"
            });

            if (!threadRes.ok) {
                const errorBody = await threadRes.text();
                console.error(`Error creating thread: ${threadRes.status} - ${errorBody}`);
                throw new Error(`Create thread failed: ${threadRes.status} ${errorBody}`);
            }
            const { id } = await threadRes.json();
            thread_id = id;
            console.log(`New thread created: ${thread_id}`);

            // Gửi thread_id về ngay lập tức nếu đang streaming để frontend lưu
            if (stream) {
                res.write(`data: ${JSON.stringify({ thread_id })}\n\n`);
                console.log(`Streamed new thread_id: ${thread_id}`);
            }
        } else {
            console.log(`Using existing thread_id: ${thread_id}`);
        }

        /* 2. Gửi message của user vào thread */
        const attachments =
            Array.isArray(file_ids) && file_ids.length
                ? file_ids.map((id) => ({
                    file_id: id,
                    tools: [{ type: "file_search" }]
                }))
                : undefined;

        console.log(`Adding message to thread ${thread_id}...`);
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
            const errorBody = await msgRes.text();
            console.error(`Error creating message: ${msgRes.status} - ${errorBody}`);
            throw new Error(`Create message failed: ${msgRes.status} ${errorBody}`);
        }
        console.log("Message added to thread.");

        /* 3. Tạo run cho assistant và xử lý streaming */
        console.log(`Creating run for assistant ${assistant_id} on thread ${thread_id}...`);
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
                    stream: true // RẤT QUAN TRỌNG: Kích hoạt streaming từ OpenAI
                })
            }
        );

        if (!runRes.ok) {
            const errorBody = await runRes.text();
            console.error(`Error creating run: ${runRes.status} - ${errorBody}`);
            throw new Error(`Create run failed: ${runRes.status} ${errorBody}`);
        }
        console.log("Run created. Starting to read OpenAI stream...");

        if (stream) {
            // Đọc luồng từ OpenAI và chuyển tiếp về client (frontend)
            const reader = runRes.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedData = ''; // Để xử lý các chunk JSON bị cắt đôi

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log("OpenAI stream finished (done signal received).");
                    break; // Thoát vòng lặp nếu luồng kết thúc
                }

                accumulatedData += decoder.decode(value, { stream: true });
                // console.log("Raw accumulated data:", accumulatedData); // Có thể bật để debug chi tiết

                let startIndex = 0;
                let newlineIndex;

                // Xử lý từng dòng hoàn chỉnh trong accumulatedData
                while ((newlineIndex = accumulatedData.indexOf('\n', startIndex)) !== -1) {
                    const line = accumulatedData.substring(startIndex, newlineIndex).trim();
                    // console.log("Processing line:", line); // Log từng dòng được xử lý

                    // --- SỬA LỖI: Kiểm tra '[DONE]' trước khi parse JSON ---
                    if (line === '[DONE]') {
                        console.log("Received [DONE] signal from OpenAI. Ending client response.");
                        res.write('data: [DONE]\n\n'); // Gửi tín hiệu DONE về client
                        res.end(); // Kết thúc phản hồi HTTP
                        return; // Thoát khỏi handler function
                    } else if (line.startsWith('data:')) {
                        const dataString = line.substring(5).trim(); // Bỏ "data: "
                        // console.log("Parsed dataString (before JSON.parse):", dataString);

                        try {
                            const parsedData = JSON.parse(dataString);
                            // console.log("Parsed OpenAI event:", parsedData.event, parsedData.data);

                            // Lọc và chuyển tiếp chỉ các chunk văn bản (text_delta)
                            if (parsedData.event === 'thread.message.delta' &&
                                parsedData.data?.delta?.content?.[0]?.type === 'text' &&
                                parsedData.data.delta.content[0].text?.value) {

                                const replyChunk = parsedData.data.delta.content[0].text.value;
                                // console.log("Extracted replyChunk:", replyChunk);
                                res.write(`data: ${JSON.stringify({ reply_chunk: replyChunk })}\n\n`); // Gửi chunk về client
                            }
                            // Bạn có thể thêm xử lý cho các loại event khác nếu cần (ví dụ: tool_calls)
                            // Ví dụ: if (parsedData.event === 'thread.tool.steps.delta') { ... }

                        } catch (e) {
                            // Xử lý lỗi khi JSON.parse thất bại (ví dụ: dòng trống, JSON không hợp lệ khác)
                            console.error("Error parsing JSON from OpenAI stream line:", e.message, "Line:", line);
                        }
                    }
                    startIndex = newlineIndex + 1; // Di chuyển con trỏ đến sau dòng đã xử lý
                }
                // Giữ lại phần dữ liệu chưa hoàn chỉnh (không kết thúc bằng '\n') cho lần đọc tiếp theo
                accumulatedData = accumulatedData.substring(startIndex);
            }

            // Fallback: Nếu luồng kết thúc mà không nhận được [DONE] (rất hiếm, nhưng để an toàn)
            console.log("OpenAI stream ended without explicit [DONE] signal. Sending final [DONE].");
            res.write('data: [DONE]\n\n');
            res.end();

        } else {
            // ---------- LOGIC NON-STREAMING (Duy trì nếu bạn muốn hỗ trợ) ----------
            console.log("Non-streaming mode: Polling run status...");
            const { id: run_id } = await runRes.json();
            let status = "queued";
            while (status !== "completed") {
                await new Promise((r) => setTimeout(r, 1000)); // Đợi 1 giây trước khi poll lại
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
                console.log(`Polling run ${run_id} status: ${status}`);

                if (["failed", "cancelled", "expired"].includes(status)) {
                    throw new Error(`Run ended with status: ${status}. Detail: ${JSON.stringify(check.last_error || 'No error details')}`);
                }
            }

            console.log("Run completed. Fetching the last assistant message...");
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

            console.log("Non-streaming: Final reply:", reply);
            return res.status(200).json({ reply, thread_id });
        }

    } catch (err) {
        console.error("Caught error in handler:", err);
        const errorMessage = err.message || "An unknown error occurred.";

        if (stream) {
            // Gửi lỗi qua luồng nếu đang streaming
            res.write(`data: ${JSON.stringify({ error: "Backend error", detail: errorMessage })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            // Trả về lỗi JSON nếu không streaming
            return res
                .status(500)
                .json({ error: "Backend error", detail: errorMessage });
        }
    }
}
