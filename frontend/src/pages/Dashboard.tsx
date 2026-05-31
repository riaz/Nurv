import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, FolderKanban, LogOut } from "lucide-react"

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([])
  const [newProjectName, setNewProjectName] = useState("")
  const navigate = useNavigate()

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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newProjectName })
      })
      if (res.ok) {
        const data = await res.json()
        setProjects([...projects, data])
        setNewProjectName("")
        navigate(`/project/${data.id}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    navigate("/")
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
              <FolderKanban className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Nurv Dashboard</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container py-8">
        <div className="grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-4">Your Projects</h2>
              {projects.length === 0 ? (
                <div className="flex h-[200px] shrink-0 items-center justify-center rounded-md border border-dashed">
                  <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
                    <FolderKanban className="h-10 w-10 text-muted-foreground mb-4" />
                    <h3 className="mt-4 text-lg font-semibold">No projects created</h3>
                    <p className="mb-4 mt-2 text-sm text-muted-foreground">
                      You haven't created any agents yet. Create a project to get started.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {projects.map((p) => (
                    <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors shadow-sm" onClick={() => navigate(`/project/${p.id}`)}>
                      <CardHeader className="p-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FolderKanban className="h-4 w-4 text-primary" />
                          {p.name}
                        </CardTitle>
                        <CardDescription>Managed Agent Project</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Create Project</CardTitle>
                <CardDescription>Spin up a new managed agent.</CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateProject}>
                <CardContent>
                  <Input
                    placeholder="Project Name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                  />
                </CardContent>
                <div className="flex items-center p-6 pt-0">
                  <Button className="w-full" type="submit" disabled={!newProjectName.trim()}>
                    <Plus className="mr-2 h-4 w-4" /> Create
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
