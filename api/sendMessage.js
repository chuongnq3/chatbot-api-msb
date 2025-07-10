export default async function handler(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  const { userText, thread_id: oldThread, assistant_id, file_ids } = req.body;

  try {
    let thread_id = oldThread;

    if (!thread_id) {
      const threadRes = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2"
        },
        body: JSON.stringify({})
      });
      const threadData = await threadRes.json();
      thread_id = threadData.id;
    }

    const attachments = file_ids.map(id => ({
      file_id: id,
      tools: [{ type: "file_search" }]
    }));

    await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        role: "user",
        content: userText,
        attachments
      })
    });

    const runRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      },
      body: JSON.stringify({
        assistant_id,
        instructions: "Trả lời ngắn gọn, đúng số liệu, bằng tiếng Việt."
      })
    });

    const { id: run_id } = await runRes.json();

    let status;
    do {
      await new Promise(r => setTimeout(r, 1000));
      const checkRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2"
        }
      });
      const check = await checkRes.json();
      status = check.status;
      if (["failed", "cancelled"].includes(status)) throw new Error("Run failed");
    } while (status !== "completed");

    const msgList = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages?limit=1`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });

    const { data } = await msgList.json();
    const reply = data?.[0]?.content?.[0]?.text?.value;

    res.status(200).json({ reply, thread_id });

  } catch (err) {
    console.error("GPT Error:", err);
    res.status(500).json({ error: "GPT Error", detail: err.message });
  }
}
