import React, { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Send, Bot, User, Loader2 } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ProjectView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [useStream, setUseStream] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initializedProjectId = useRef<string | null>(null)

  useEffect(() => {
    fetchProject()
  }, [id])

  const fetchProject = async () => {
    const token = localStorage.getItem("token")
    if (!token) return

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()

        // Auto-initialize if needed
        if (data.initial_prompt && !data.latest_interaction_id && initializedProjectId.current !== id) {
          initializedProjectId.current = id
          sendMessage(data.initial_prompt)
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const prompt = input
    setInput("")
    await sendMessage(prompt)
  }

  const sendMessage = async (prompt: string) => {
    // Add user message and a temporary loading agent message
    setMessages(prev => [...prev, { role: "user", content: prompt }])

    if (useStream) {
      // Add placeholder for agent response
      setMessages(prev => [...prev, { role: "agent", content: "", isStreaming: true }])
    }

    setLoading(true)

    const token = localStorage.getItem("token")

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt,
          project_id: parseInt(id || "0"),
          stream: useStream
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || "Failed to fetch response")
      }

      if (useStream) {
        if (!res.body) throw new Error("No response body")
        const reader = res.body.getReader()
        const decoder = new TextDecoder("utf-8")
        let done = false

        while (!done) {
          const { value, done: readerDone } = await reader.read()
          done = readerDone
          if (value) {
            const chunk = decoder.decode(value)
            const lines = chunk.split("\n\n").filter(l => l.startsWith("data: "))

            for (const line of lines) {
              try {
                const data = JSON.parse(line.replace("data: ", ""))
                if (data.type === "token") {
                  setMessages(prev => {
                    const newMessages = [...prev]
                    const lastMessage = newMessages[newMessages.length - 1]
                    if (lastMessage && lastMessage.role === "agent" && lastMessage.isStreaming) {
                      lastMessage.content += data.content
                    }
                    return newMessages
                  })
                } else if (data.type === "done" || data.type === "error") {
                  setMessages(prev => {
                    const newMessages = [...prev]
                    const lastMessage = newMessages[newMessages.length - 1]
                    if (lastMessage && lastMessage.role === "agent") {
                      lastMessage.isStreaming = false
                      if (data.type === "error") lastMessage.error = data.message
                    }
                    return newMessages
                  })
                }
              } catch (e) {
                console.error("Error parsing stream chunk", line)
              }
            }
          }
        }
      } else {
        const data = await res.json()
        setMessages(prev => [...prev, { role: "agent", content: data.output }])
      }

    } catch (err: any) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        { role: "agent", content: "", error: err.message || "Failed to connect to agent sandbox." }
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b flex items-center p-4 bg-card shadow-sm z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mr-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold leading-none tracking-tight">Managed Agent Sandbox</h1>
            <p className="text-xs text-muted-foreground">Project #{id}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !loading ? (
            <div className="h-[40vh] flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <div className="max-w-sm">
                <h2 className="text-2xl font-semibold">How can I help?</h2>
                <p className="text-muted-foreground mt-2">Enter a prompt below. It will be sent to your remote sandbox agent.</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "agent" && (
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center mt-1">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-3 max-w-[85%] shadow-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed overflow-x-auto">
                      {msg.role === "user" ? (
                        msg.content
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      )}
                      {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 bg-primary/60 animate-pulse align-middle" />}
                    </div>
                    {msg.error && <p className="text-xs text-destructive mt-2">Error: {msg.error}</p>}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 shrink-0 rounded-full bg-secondary flex items-center justify-center mt-1">
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {loading && !useStream && (
                <div className="flex gap-4 justify-start">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center mt-1">
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  </div>
                  <div className="rounded-2xl px-4 py-3 max-w-[85%] shadow-sm bg-card border text-sm text-muted-foreground flex items-center gap-2">
                    Running in remote sandbox...
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="p-4 bg-background border-t">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSend} className="relative flex items-center">
            <Input
              className="pr-12 py-6 rounded-full shadow-sm bg-card border-muted-foreground/20 focus-visible:ring-primary/30"
              placeholder="Ask the managed agent..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 h-9 w-9 rounded-full transition-all"
              disabled={!input.trim() || loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <div className="flex items-center justify-between mt-2 px-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input
                type="checkbox"
                checked={useStream}
                onChange={(e) => setUseStream(e.target.checked)}
                className="rounded border-muted-foreground/30"
              />
              Stream Response
            </label>
            <p className="text-xs text-muted-foreground">Responses are generated by the Google GenAI managed sandbox.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
