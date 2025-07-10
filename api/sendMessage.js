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
  maxDuration: 30,
  // Tối ưu memory và regions
  memory: 1024, // Tăng memory nếu cần
  regions: ["sin1"] // Chọn region gần nhất (Singapore cho VN)
};

// Cache assistant info to reduce API calls
const assistantCache = new Map();
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Utility function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Optimized retry function
async function retryRequest(requestFn, maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await delay(RETRY_DELAY * attempt);
    }
  }
}

// Optimized OpenAI API call
async function makeOpenAIRequest(url, options, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
        ...options.headers
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export default async function handler(req, res) {
  const startTime = Date.now();
  
  /* ------------------------ CORS & pre-flight ------------------------ */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

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

  /* --------------------------- Validate body ------------------------- */
  const {
    userText,
    thread_id: oldThread,
    assistant_id,
    file_ids = []
  } = req.body ?? {};

  if (typeof userText !== "string" || !userText.trim()) {
    return res.status(400).json({ error: "Missing or invalid userText" });
  }
  if (!assistant_id) {
    return res.status(400).json({ error: "Missing assistant_id" });
  }

  /* ------------------------------ Logic ------------------------------ */
  try {
    let thread_id = oldThread;

    /* 1. Tạo thread nếu chưa có - với retry */
    if (!thread_id) {
      const threadData = await retryRequest(async () => {
        return await makeOpenAIRequest("https://api.openai.com/v1/threads", {
          method: "POST",
          body: JSON.stringify({
            metadata: {
              created_at: new Date().toISOString(),
              source: "web_chat"
            }
          })
        }, apiKey);
      });
      
      thread_id = threadData.id;
    }

    /* 2. Gửi message của user vào thread - tối ưu payload */
    const attachments = Array.isArray(file_ids) && file_ids.length > 0
      ? file_ids.map((id) => ({
          file_id: id,
          tools: [{ type: "file_search" }]
        }))
      : undefined;

    await retryRequest(async () => {
      return await makeOpenAIRequest(
        `https://api.openai.com/v1/threads/${thread_id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            role: "user",
            content: userText.trim(), // Trim để giảm payload
            ...(attachments && { attachments })
          })
        },
        apiKey
      );
    });

    /* 3. Tạo run cho assistant - tối ưu instructions */
    const runData = await retryRequest(async () => {
      return await makeOpenAIRequest(
        `https://api.openai.com/v1/threads/${thread_id}/runs`,
        {
          method: "POST",
          body: JSON.stringify({
            assistant_id,
            instructions: "Trả lời ngắn gọn, đúng số liệu, bằng tiếng Việt. Ưu tiên tốc độ phản hồi.",
            // Tối ưu thêm
            temperature: 0.7, // Giảm temperature để response nhanh hơn
            max_prompt_tokens: 4000, // Giới hạn prompt tokens
            max_completion_tokens: 1000 // Giới hạn completion tokens
          })
        },
        apiKey
      );
    });

    const run_id = runData.id;

    /* 4. Poll tối ưu - giảm polling interval và timeout */
    let status = "queued";
    let pollCount = 0;
    const maxPollCount = 25; // Giới hạn 25 lần poll (25 giây)
    
    while (status !== "completed" && pollCount < maxPollCount) {
      // Adaptive polling - bắt đầu nhanh rồi chậm dần
      const pollInterval = pollCount < 5 ? 500 : 1000;
      await delay(pollInterval);
      pollCount++;

      const checkData = await retryRequest(async () => {
        return await makeOpenAIRequest(
          `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`,
          { method: "GET" },
          apiKey
        );
      });

      status = checkData.status;
      
      console.log(`Poll ${pollCount}: status = ${status}`);

      if (["failed", "cancelled", "expired"].includes(status)) {
        throw new Error(`Run ended with status: ${status}`);
      }
    }

    if (status !== "completed") {
      throw new Error(`Run timed out after ${pollCount} polls`);
    }

    /* 5. Lấy message cuối cùng - tối ưu query */
    const messagesData = await retryRequest(async () => {
      return await makeOpenAIRequest(
        `https://api.openai.com/v1/threads/${thread_id}/messages?limit=1&order=desc`,
        { method: "GET" },
        apiKey
      );
    });

    const reply = messagesData.data?.[0]?.content?.[0]?.text?.value ??
      "Xin lỗi, mình chưa có thông tin để trả lời.";

    /* 6. Trả về với thông tin performance */
    const processingTime = Date.now() - startTime;
    console.log(`Request completed in ${processingTime}ms`);
    
    return res.status(200).json({ 
      reply, 
      thread_id,
      // Thông tin debug (có thể bỏ trong production)
      meta: {
        processing_time: processingTime,
        polls_count: pollCount
      }
    });
    
  } catch (err) {
    const processingTime = Date.now() - startTime;
    console.error(`GPT Error after ${processingTime}ms:`, err);
    
    // Detailed error response
    const errorResponse = {
      error: "GPT Error",
      detail: err.message ?? String(err),
      processing_time: processingTime
    };
    
    // Return appropriate status code
    if (err.message?.includes("timeout") || err.message?.includes("timed out")) {
      return res.status(408).json(errorResponse);
    }
    
    return res.status(500).json(errorResponse);
  }
}

