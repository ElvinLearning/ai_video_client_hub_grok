/**
 * Cozy Agent v1: a guided brief, not a general model.
 * It asks a fixed sequence, drafts shots from the answers, and queues a request.
 * It does not invent facts about the client's business.
 */

export function blankThread(userId) {
  return {
    id: `thr_${userId}`,
    userId,
    step: "business",
    draft: {
      business: "",
      audience: "",
      action: "",
      shot: "",
    },
    messages: [
      {
        role: "agent",
        content:
          "I am Cozy Agent. I will help you write the brief and pick the shots, then queue a film with the studio. What does the business sell, in one sentence?",
      },
    ],
    shots: [],
    brief: "",
    updatedAt: new Date().toISOString(),
  }
}

function push(thread, content, role = "agent") {
  thread.messages.push({ role, content, at: new Date().toISOString() })
  thread.updatedAt = new Date().toISOString()
}

function shotsFor(draft) {
  const product = draft.business || "the product"
  const audience = draft.audience || "the customer"
  const action = draft.action || "take the next step"
  return [
    {
      id: "close",
      title: "The product, close",
      line: `Open on ${product}, filling the frame. End on the logo and one line asking ${audience} to ${action}.`,
    },
    {
      id: "place",
      title: "The place it lives",
      line: `Start in the real setting where ${audience} would meet ${product}. Hold on one detail. Close with the ask: ${action}.`,
    },
    {
      id: "type",
      title: "One sentence, then the picture",
      line: `A quiet frame. The offer appears as a single sentence — ${action} — then the product resolves underneath it.`,
    },
  ]
}

export function agentReply(thread, text) {
  const said = String(text || "").trim()
  if (!said) {
    push(thread, "I need a few words before I can take the next step.")
    return thread
  }
  push(thread, said, "user")

  if (thread.step === "business") {
    thread.draft.business = said
    thread.step = "audience"
    push(thread, "Who is it for? Name the person you want to reach, not a demographic report.")
    return thread
  }

  if (thread.step === "audience") {
    thread.draft.audience = said
    thread.step = "action"
    push(thread, "What should they do after they watch? One action.")
    return thread
  }

  if (thread.step === "action") {
    thread.draft.action = said
    thread.step = "shots"
    thread.shots = shotsFor(thread.draft)
    const lines = thread.shots.map((shot, index) => `${index + 1}. ${shot.title} — ${shot.line}`).join("\n")
    push(
      thread,
      `Three shots, drawn only from what you just told me. Reply 1, 2, or 3, or describe the shot you actually want.\n\n${lines}`,
    )
    return thread
  }

  if (thread.step === "shots") {
    const pick = thread.shots.find((shot, index) => said === String(index + 1) || said.toLowerCase() === shot.id)
    thread.draft.shot = pick ? pick.line : said
    thread.brief = [
      `Business: ${thread.draft.business}`,
      `Audience: ${thread.draft.audience}`,
      `Ask: ${thread.draft.action}`,
      `Shot: ${thread.draft.shot}`,
    ].join("\n")
    thread.step = "confirm"
    push(
      thread,
      `Here is the brief I will queue. Say “queue” to send it to the studio, or tell me what to change.\n\n${thread.brief}`,
    )
    return thread
  }

  if (thread.step === "confirm") {
    if (/^queue\b/i.test(said) || /^send\b/i.test(said)) {
      thread.wantsQueue = true
      return thread
    }
    thread.draft.shot = said
    thread.brief = [
      `Business: ${thread.draft.business}`,
      `Audience: ${thread.draft.audience}`,
      `Ask: ${thread.draft.action}`,
      `Shot: ${thread.draft.shot}`,
    ].join("\n")
    push(thread, `Updated. Say “queue” when this is the brief you want.\n\n${thread.brief}`)
    return thread
  }

  push(thread, "This brief is already queued. Open your films to see it, or start a new one from the desk.")
  return thread
}

export function publicThread(thread) {
  if (!thread) return null
  return {
    step: thread.step,
    draft: thread.draft,
    shots: thread.shots || [],
    brief: thread.brief || "",
    readyToQueue: thread.step === "queued",
    messages: thread.messages,
  }
}
