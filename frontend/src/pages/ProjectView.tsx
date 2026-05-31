import React, { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Send, Bot, User, Loader2, Workflow, MessageSquare, ImageIcon, X } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AgentFlow } from "@/components/AgentFlow"

export default function ProjectView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [input, setInput] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [useStream, setUseStream] = useState(true)
  const [projectData, setProjectData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'flow'>('chat')
  const scrollRef = useRef<HTMLDivElement>(null)
  const initializedProjectId = useRef<string | null>(null)

  useEffect(() => {
    fetchProject()
  }, [id])

  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId)
    } else {
      setMessages([])
    }
  }, [activeSessionId])

  const fetchProject = async () => {
    const token = localStorage.getItem("token")
    if (!token) return

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setProjectData(data)

        // Fetch sessions
        try {
          const sessRes = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}/sessions`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (sessRes.ok) {
            const sessData = await sessRes.json()
            setSessions(sessData)

            // Auto-select latest or first session
            if (sessData.length > 0) {
              const latestSession = sessData[sessData.length - 1]
              setActiveSessionId(latestSession.id)

              // Auto-initialize logic for new projects
              if (data.initial_prompt && !latestSession.latest_interaction_id && initializedProjectId.current !== id) {
                initializedProjectId.current = id || null
                // Small delay to ensure state is set before sending message
                setTimeout(() => sendMessage(data.initial_prompt, latestSession.id), 100)
              }
            }
          }
        } catch (e) {
          console.error("Failed to fetch sessions", e)
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchMessages = async (sessionId: number) => {
    const token = localStorage.getItem("token")
    if (!token) return
    try {
      const histRes = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (histRes.ok) {
        const histData = await histRes.json()
        setMessages(histData || [])
      }
    } catch (e) {
      console.error("Failed to fetch history", e)
    }
  }

  const createNewSession = async () => {
    const token = localStorage.getItem("token")
    if (!token) return
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: `Session ${sessions.length + 1}` })
    })
    if (res.ok) {
      const data = await res.json()
      setSessions(prev => [...prev, data])
      setActiveSessionId(data.id)
      setActiveTab('chat')
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && !selectedFile) || loading || !activeSessionId) return

    const prompt = input
    const file = selectedFile
    setInput("")
    setSelectedFile(null)
    await sendMessage(prompt, activeSessionId, file)
  }

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        resolve(reader.result?.toString().split(',')[1] || "")
      }
      reader.onerror = error => reject(error)
    })
  }

  const sendMessage = async (prompt: string, sessionId: number, file: File | null = null) => {
    const userContent = file
      ? `${prompt}\n\n![Uploaded Image](${URL.createObjectURL(file)})`
      : prompt

    setMessages(prev => [...prev, { role: "user", content: userContent }])

    if (useStream) {
      setMessages(prev => [...prev, { role: "agent", content: "", isStreaming: true }])
    }

    setLoading(true)
    const token = localStorage.getItem("token")

    try {
      let imagePayload = undefined
      if (file) {
        const base64Data = await convertToBase64(file)
        imagePayload = {
          data: base64Data,
          mime_type: file.type
        }
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: prompt || "Attached Image",
          project_id: parseInt(id || "0"),
          session_id: sessionId,
          stream: useStream,
          image: imagePayload
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
                } else if (data.type === "citations") {
                  setMessages(prev => {
                    const newMessages = [...prev]
                    const lastMessage = newMessages[newMessages.length - 1]
                    if (lastMessage && lastMessage.role === "agent") {
                      lastMessage.sources = data.sources
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

                  // If this was the first message initializing the session, update session list to reflect latest_interaction_id
                  if (data.interaction_id) {
                     setSessions(prev => prev.map(s => s.id === sessionId ? {...s, latest_interaction_id: data.interaction_id} : s))
                  }
                } else if (data.type === "meta") {
                     setSessions(prev => prev.map(s => s.id === sessionId ? {...s, latest_interaction_id: data.interaction_id} : s))
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
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">

      {/* Sidebar for Chat Sessions */}
      <div className="w-64 border-r border-border bg-card/40 backdrop-blur-md flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mr-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold text-sm truncate flex-1">
            {projectData?.name || "Managed Agent"}
          </div>
        </div>

        <div className="p-4">
          <Button onClick={createNewSession} className="w-full flex items-center justify-center gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-md transition-all">
            <MessageSquare className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => {
                setActiveSessionId(session.id)
                setActiveTab('chat')
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-3
                ${activeSessionId === session.id
                  ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              <MessageSquare className="h-4 w-4 opacity-70" />
              <span className="truncate">{session.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-md z-10 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/40 to-primary/10 flex items-center justify-center overflow-hidden shadow-inner ring-1 ring-border/50">
              {projectData?.logo_url ? (
                <img src={projectData.logo_url.startsWith('http') ? projectData.logo_url : `${import.meta.env.VITE_API_URL}${projectData.logo_url}`} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <Bot className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-none">{projectData?.name || "Agent Sandbox"}</h1>
              <p className="text-xs text-muted-foreground mt-1 tracking-wide uppercase">{sessions.find(s => s.id === activeSessionId)?.name || 'Initializing...'}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/50 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'chat' ? 'bg-card shadow-sm text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <MessageSquare className="h-4 w-4" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('flow')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'flow' ? 'bg-card shadow-sm text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Workflow className="h-4 w-4" />
              Architecture
            </button>
          </div>
        </header>

        {activeTab === 'flow' ? (
          <div className="flex-1 w-full h-full bg-muted/10 relative">
             <AgentFlow config={projectData?.agent_config} />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 relative" ref={scrollRef}>
              <div className="max-w-3xl mx-auto space-y-6 pb-4">
                {messages.length === 0 && !loading ? (
                  <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center overflow-hidden shadow-xl ring-1 ring-border/50 relative group">
                      <div className="absolute inset-0 bg-primary/20 group-hover:bg-transparent transition-colors"></div>
                      {projectData?.logo_url ? (
                        <img src={projectData.logo_url.startsWith('http') ? projectData.logo_url : `${import.meta.env.VITE_API_URL}${projectData.logo_url}`} alt="Project Logo" className="h-full w-full object-cover scale-105 group-hover:scale-100 transition-transform duration-500" />
                      ) : (
                        <Bot className="h-10 w-10 text-primary drop-shadow-md" />
                      )}
                    </div>
                    <div className="max-w-sm">
                      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">How can I help?</h2>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">Enter a prompt below. Your message will be processed by the remote sandbox agent.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        {msg.role === "agent" && (
                          <div className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mt-1 overflow-hidden shadow-sm ring-1 ring-border/50">
                            {projectData?.logo_url ? (
                              <img src={projectData.logo_url.startsWith('http') ? projectData.logo_url : `${import.meta.env.VITE_API_URL}${projectData.logo_url}`} alt="Logo" className="h-full w-full object-cover" />
                            ) : (
                              <Bot className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        )}
                        <div className={`rounded-2xl px-5 py-3.5 max-w-[85%] shadow-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-border/50 rounded-tl-sm"}`}>
                          <div className="whitespace-pre-wrap text-[15px] leading-relaxed overflow-x-auto font-medium">
                            {msg.role === "user" ? (
                              msg.content
                            ) : (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({node, href, children, ...props}) => {
                                    if (href?.startsWith('citation:')) {
                                      const sourceId = parseInt(href.split(':')[1]);
                                      const source = msg.sources?.find((s: any) => s.id === sourceId);
                                      if (source) {
                                        return (
                                          <span className="relative group inline-block">
                                            <a href={source.url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 font-bold mx-0.5 px-1 rounded-sm text-xs cursor-pointer transition-colors border-b border-primary/30 hover:border-primary">
                                              {children}
                                            </a>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 bg-popover/95 backdrop-blur-md text-popover-foreground border shadow-xl rounded-lg p-3 text-xs z-50 animate-in fade-in zoom-in duration-200">
                                              <p className="font-semibold truncate mb-1 text-sm">{source.title}</p>
                                              <p className="text-muted-foreground truncate opacity-80">{source.url}</p>
                                            </div>
                                          </span>
                                        );
                                      }
                                      return <span className="text-muted-foreground">{children}</span>;
                                    }
                                    return <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors" {...props}>{children}</a>
                                  }
                                }}
                              >
                                {msg.content.replace(/\[(\d+)\]/g, '[$1](citation:$1)')}
                              </ReactMarkdown>
                            )}
                            {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 bg-primary/60 animate-pulse align-middle" />}
                          </div>
                          {msg.error && <p className="text-xs text-destructive mt-3 font-semibold bg-destructive/10 p-2 rounded-md">Error: {msg.error}</p>}
                        </div>
                        {msg.role === "user" && (
                          <div className="h-8 w-8 shrink-0 rounded-xl bg-secondary flex items-center justify-center mt-1 shadow-sm ring-1 ring-border/50">
                            <User className="h-4 w-4 text-secondary-foreground" />
                          </div>
                        )}
                      </div>
                    ))}

                    {loading && !useStream && (
                      <div className="flex gap-4 justify-start animate-in fade-in">
                        <div className="h-8 w-8 shrink-0 rounded-xl bg-primary/20 flex items-center justify-center mt-1">
                          <Loader2 className="h-4 w-4 text-primary animate-spin" />
                        </div>
                        <div className="rounded-2xl px-5 py-3.5 max-w-[85%] shadow-sm bg-card border border-border/50 text-sm text-muted-foreground flex items-center gap-2 rounded-tl-sm font-medium">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{animationDelay: '0ms'}}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{animationDelay: '150ms'}}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{animationDelay: '300ms'}}></span>
                          </span>
                          Processing in remote sandbox...
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="p-4 bg-background/80 backdrop-blur-xl border-t border-border shrink-0 z-10">
              <div className="max-w-3xl mx-auto">
                {selectedFile && (
                  <div className="mb-3 flex items-center gap-3 p-2 bg-muted/30 rounded-lg border border-border/50 w-max animate-in fade-in zoom-in-95">
                    <div className="relative h-12 w-12 rounded-md overflow-hidden bg-background">
                      <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex flex-col max-w-[150px]">
                      <span className="text-xs font-medium truncate">{selectedFile.name}</span>
                      <span className="text-[10px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="ml-2 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <form onSubmit={handleSend} className="relative flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0])
                      }
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-14 w-14 rounded-2xl shrink-0 bg-card/50 backdrop-blur-sm border-border/50 text-muted-foreground hover:text-primary transition-all shadow-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || !activeSessionId}
                  >
                    <ImageIcon className="h-5 w-5" />
                  </Button>
                  <Input
                    className="pr-14 py-7 rounded-2xl shadow-sm bg-card/50 border-border/50 focus-visible:ring-primary/50 text-[15px] font-medium backdrop-blur-sm transition-all flex-1"
                    placeholder={activeSessionId ? "Message your agent..." : "Create a new chat to begin..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={loading || !activeSessionId}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="absolute right-2 h-10 w-10 rounded-xl transition-all shadow-md bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95"
                    disabled={(!input.trim() && !selectedFile) || loading || !activeSessionId}
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" /> : <Send className="h-5 w-5 text-primary-foreground" />}
                  </Button>
                </form>
                <div className="flex items-center justify-between mt-3 px-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors group">
                    <input
                      type="checkbox"
                      checked={useStream}
                      onChange={(e) => setUseStream(e.target.checked)}
                      className="rounded border-border/50 text-primary focus:ring-primary/50 transition-all bg-card cursor-pointer"
                    />
                    Stream Response
                  </label>
                  <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Secured by Managed Agents Sandbox</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
