import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, FolderKanban, LogOut, MoreVertical, Download, Search, Settings2, Code2, Globe, Link, Cpu } from "lucide-react"

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([])
  const [newProjectName, setNewProjectName] = useState("")
  const [initialPrompt, setInitialPrompt] = useState("")
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [multiAgent, setMultiAgent] = useState(false)

  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<"projects" | "create">("projects")

  // Faceted Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [filterMultiAgent, setFilterMultiAgent] = useState(false)
  const [filterHasTools, setFilterHasTools] = useState(false)

  const navigate = useNavigate()

  const AVAILABLE_TOOLS = [
    { id: "code_execution", label: "Code Execution", icon: <Code2 className="h-4 w-4" /> },
    { id: "google_search", label: "Google Search", icon: <Globe className="h-4 w-4" /> },
    { id: "url_context", label: "URL Context", icon: <Link className="h-4 w-4" /> }
  ]

  const toggleTool = (toolId: string) => {
    setSelectedTools(prev =>
      prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]
    )
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/")
      return
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      } else if (res.status === 401) {
        navigate("/")
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim()) return

    const token = localStorage.getItem("token")
    try {
      const parsedConfig = {
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        multi_agent: multiAgent
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newProjectName,
          initial_prompt: initialPrompt || null,
          agent_config: parsedConfig
        })
      })
      if (res.ok) {
        const data = await res.json()
        setProjects([...projects, data])
        setNewProjectName("")
        setInitialPrompt("")
        setSelectedTools([])
        setMultiAgent(false)
        setActiveTab("projects") // Switch back to projects tab after creation
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    navigate("/")
  }

  const handleDownloadSandbox = async (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation()
    setOpenMenuId(null)
    const token = localStorage.getItem("token")
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${projectId}/sandbox-files`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `sandbox-${projectId}.tar`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } else {
        alert("Failed to download sandbox files. Make sure the agent has created an environment.")
      }
    } catch (err) {
      console.error("Download failed", err)
      alert("Download failed")
    }
  }

  const filteredProjects = projects.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false

    const config = p.agent_config || {}
    if (filterMultiAgent && !config.multi_agent) return false
    if (filterHasTools && (!config.tools || config.tools.length === 0)) return false

    return true
  })

  return (
    <div className="flex h-screen bg-muted/10 overflow-hidden" onClick={() => setOpenMenuId(null)}>
      {/* Sidebar */}
      <aside className="w-64 border-r bg-background/95 backdrop-blur flex flex-col shadow-sm z-10 shrink-0">
        <div className="h-16 flex items-center px-6 border-b shrink-0">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center mr-3">
            <Cpu className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Nurv</h1>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
          <Button
            variant={activeTab === "projects" ? "secondary" : "ghost"}
            className="w-full justify-start text-base font-medium"
            onClick={() => setActiveTab("projects")}
          >
            <FolderKanban className="mr-3 h-5 w-5" />
            My Projects
          </Button>
          <Button
            variant={activeTab === "create" ? "secondary" : "ghost"}
            className="w-full justify-start text-base font-medium"
            onClick={() => setActiveTab("create")}
          >
            <Plus className="mr-3 h-5 w-5" />
            Create Project
          </Button>
        </nav>

        <div className="p-4 border-t shrink-0">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="mr-3 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto relative bg-muted/20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

        <div className="container max-w-6xl py-10 px-8 relative z-10">
          {activeTab === "projects" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Your Projects</h2>
                  <p className="text-muted-foreground mt-1 text-lg">Manage and orchestrate your autonomous agents.</p>
                </div>
                <Button onClick={() => setActiveTab("create")} className="shadow-sm">
                  <Plus className="mr-2 h-4 w-4" /> New Project
                </Button>
              </div>

              {/* Faceted Search */}
              <div className="flex flex-col sm:flex-row gap-4 p-4 bg-card rounded-xl border shadow-sm items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-background/50 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-primary/50 h-10"
                  />
                </div>
                <div className="h-8 w-px bg-border hidden sm:block"></div>
                <div className="flex items-center gap-4 w-full sm:w-auto px-2">
                  <div className="flex items-center text-muted-foreground">
                    <Settings2 className="h-4 w-4 mr-2" />
                    <span className="text-sm font-medium">Filters:</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors">
                    <input
                      type="checkbox"
                      checked={filterMultiAgent}
                      onChange={(e) => setFilterMultiAgent(e.target.checked)}
                      className="rounded border-muted-foreground/30 bg-transparent text-primary focus:ring-primary h-4 w-4"
                    />
                    Multi-Agent
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors">
                    <input
                      type="checkbox"
                      checked={filterHasTools}
                      onChange={(e) => setFilterHasTools(e.target.checked)}
                      className="rounded border-muted-foreground/30 bg-transparent text-primary focus:ring-primary h-4 w-4"
                    />
                    Has Tools
                  </label>
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed bg-card/50">
                  <div className="mx-auto flex flex-col items-center justify-center text-center max-w-sm">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                      <FolderKanban className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold">No projects found</h3>
                    <p className="mt-2 text-muted-foreground">
                      {projects.length === 0
                        ? "You haven't created any agents yet. Get started by creating your first project."
                        : "No projects match your current search filters."}
                    </p>
                    {projects.length === 0 && (
                      <Button onClick={() => setActiveTab("create")} className="mt-6" variant="outline">
                        Create Project
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProjects.map((p) => (
                    <Card key={p.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-300 relative group overflow-hidden bg-card/80 backdrop-blur" onClick={() => navigate(`/project/${p.id}`)}>
                      <CardHeader className="p-6 pr-12">
                        <CardTitle className="text-xl flex items-center gap-3">
                          {p.logo_url ? (
                            <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 ring-1 ring-border shadow-sm">
                              <img src={p.logo_url.startsWith('http') ? p.logo_url : `${import.meta.env.VITE_API_URL}${p.logo_url}`} alt="Project Logo" className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <FolderKanban className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <span className="truncate">{p.name}</span>
                        </CardTitle>
                        <CardDescription className="pt-2 flex flex-wrap items-center gap-2">
                           {p.agent_config?.multi_agent && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">Multi-Agent</span>}
                           {p.agent_config?.tools?.length > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">{p.agent_config.tools.length} Tools</span>}
                           {!p.agent_config?.multi_agent && (!p.agent_config?.tools || p.agent_config.tools.length === 0) && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Standard Agent</span>}
                        </CardDescription>
                      </CardHeader>
                      <div className="absolute top-4 right-4 z-20">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:bg-background/80 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === p.id ? null : p.id)
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                        {openMenuId === p.id && (
                          <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl bg-popover ring-1 ring-black ring-opacity-5 z-50 p-1 border overflow-hidden">
                            <button
                              onClick={(e) => handleDownloadSandbox(e, p.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-popover-foreground hover:bg-muted rounded-md transition-colors font-medium"
                            >
                              <Download className="h-4 w-4" />
                              Download Sandbox
                            </button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "create" && (
            <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-8 duration-500 pb-20">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Create New Project</h2>
                <p className="text-muted-foreground mt-1 text-lg">Configure a sophisticated managed agent.</p>
              </div>

              <Card className="shadow-lg border-primary/10 bg-card/60 backdrop-blur-xl">
                <form onSubmit={handleCreateProject}>
                  <CardContent className="p-8 space-y-10">

                    {/* Basic Info */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <FolderKanban className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Basic Information</h3>
                      </div>

                      <div className="space-y-6 pt-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Project Name</label>
                          <Input
                            placeholder="e.g. Sales Analysis Agent"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            className="h-12 text-lg bg-background/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">System Prompt & Instructions (Optional)</label>
                          <textarea
                            placeholder="Describe the agent's persona and core directives..."
                            value={initialPrompt}
                            onChange={(e) => setInitialPrompt(e.target.value)}
                            className="flex min-h-[120px] w-full rounded-md border border-input bg-background/50 px-4 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all resize-y"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Capabilities */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Settings2 className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Agent Capabilities</h3>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4 pt-2">
                        <label className={`relative flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${multiAgent ? 'border-primary bg-primary/5 shadow-md' : 'border-border hover:border-primary/30 bg-background/50'}`}>
                          <input
                            type="checkbox"
                            checked={multiAgent}
                            onChange={(e) => setMultiAgent(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`mt-0.5 shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${multiAgent ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 bg-transparent'}`}>
                            {multiAgent && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div className="space-y-1">
                            <span className="block font-semibold text-foreground">Multi-Agent Mode</span>
                            <span className="block text-sm text-muted-foreground">Allows the agent to spawn sub-agents to solve complex, multi-step problems autonomously.</span>
                          </div>
                        </label>
                      </div>

                      <div className="space-y-4 pt-4">
                        <div className="text-sm font-semibold text-foreground">MCP Tools & Extensions</div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {AVAILABLE_TOOLS.map(tool => {
                            const isSelected = selectedTools.includes(tool.id)
                            return (
                              <button
                                key={tool.id}
                                type="button"
                                onClick={() => toggleTool(tool.id)}
                                className={`flex flex-col gap-3 p-5 rounded-xl border text-left transition-all duration-200 ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground border-primary shadow-md ring-1 ring-primary ring-offset-1 ring-offset-background"
                                    : "bg-background/50 text-foreground hover:bg-muted border-border hover:border-primary/50"
                                }`}
                              >
                                <div className={`p-2.5 rounded-lg w-fit ${isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                  {tool.icon}
                                </div>
                                <span className="font-semibold text-sm">{tool.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  <div className="p-8 pt-0 flex justify-end gap-4 mt-6">
                    <Button variant="ghost" type="button" onClick={() => setActiveTab("projects")}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={!newProjectName.trim()} size="lg" className="min-w-[150px] shadow-lg shadow-primary/20">
                      <Plus className="mr-2 h-5 w-5" /> Deploy Agent
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
