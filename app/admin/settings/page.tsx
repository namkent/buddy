"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

const AgentIcon = ({ icon, className }: { icon: string, className?: string }) => {
  if (!icon) return <LucideIcons.Bot className={cn("size-4", className)} />;
  const isEmoji = /\p{Emoji}/u.test(icon) && !/^[a-zA-Z0-9]+$/.test(icon);
  if (isEmoji) return <span className={cn("text-base", className)}>{icon}</span>;
  const IconComponent = (LucideIcons as any)[icon];
  if (IconComponent) return <IconComponent className={cn("size-4", className)} />;
  return <span className={cn("text-xs font-bold", className)}>{icon.substring(0, 2)}</span>;
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [setRes, sugRes, agRes] = await Promise.all([
        fetch("/api/admin/settings"),
        fetch("/api/admin/suggestions"),
        fetch("/api/chat/agents")
      ]);
      const setList = await setRes.json();
      const sugList = await sugRes.json();
      const agList = await agRes.json();

      const obj: Record<string, string> = {};
      if (Array.isArray(setList)) {
        setList.forEach((s: any) => { obj[s.key] = s.value; });
      }
      setSettings(obj);
      if (Array.isArray(sugList)) setSuggestions(sugList);
      if (Array.isArray(agList)) setAgents(agList);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = Object.keys(settings).map(key => ({ key, value: settings[key] }));
    try {
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload })
      });
      toast.success("Settings saved successfully!");
    } catch {
      toast.error("Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSuggestion = async (id: number) => {
    if (!confirm("Are you sure you want to delete this suggestion?")) return;
    try {
      await fetch(`/api/admin/suggestions?id=${id}`, { method: "DELETE" });
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch {
      toast.error("Error deleting");
    }
  };

  const handleToggleSuggestionActive = async (id: number, currentActive: boolean) => {
    try {
      await fetch(`/api/admin/suggestions?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive })
      });
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, active: !currentActive } : s));
    } catch {
      toast.error("Error updating");
    }
  };

  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPrompt.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/admin/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), prompt: newPrompt.trim() })
      });
      const json = await r.json();
      if (json.suggestion) {
        setSuggestions(prev => [json.suggestion, ...prev]);
        setNewTitle("");
        setNewPrompt("");
      }
    } catch {
      toast.error("Error creating suggestion");
    }
    setCreating(false);
  };

  const handleTriggerCron = async () => {
    if (!confirm("Run cron job to generate suggestions now? (this uses LLM API)")) return;
    setSaving(true);
    try {
      const r = await fetch("/api/cron/suggestions");
      const json = await r.json();
      if (json.success) toast.success("Generated! Refreshing...");
      else toast.error("Failed: " + json.error);
      await loadSettings();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDesc, setNewAgentDesc] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");
  const [newAgentIcon, setNewAgentIcon] = useState("Bot");

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentPrompt.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/chat/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newAgentName.trim(), 
          description: newAgentDesc.trim(),
          system_prompt: newAgentPrompt.trim(),
          icon: newAgentIcon
        })
      });
      const agent = await r.json();
      if (agent.id) {
        setAgents(prev => [agent, ...prev]);
        setNewAgentName("");
        setNewAgentDesc("");
        setNewAgentPrompt("");
        toast.success("Agent created!");
      }
    } catch {
      toast.error("Error creating agent");
    }
    setCreating(false);
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      await fetch(`/api/chat/agents?id=${id}`, { method: "DELETE" });
      setAgents(prev => prev.filter(a => a.id !== id));
      toast.success("Agent deleted");
    } catch {
      toast.error("Error deleting agent");
    }
  };

  const handleToggleAgentActive = async (id: string, current: boolean) => {
    try {
      await fetch("/api/chat/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current })
      });
      setAgents(prev => prev.map(a => a.id === id ? { ...a, is_active: !current } : a));
    } catch {
      toast.error("Error updating agent");
    }
  };

  if (loading) return <div className="p-8 animate-pulse text-center">Loading settings...</div>;

  return (
    <div className="max-w-6xl w-full mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground mt-2">Manage application configuration, AI behavior, and thread suggestions.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-2 bg-zinc-100/50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-1">
          <TabsTrigger value="general" className="data-[state=active]:text-indigo-600 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none">General Config</TabsTrigger>
          <TabsTrigger value="agents" className="data-[state=active]:text-indigo-600 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none">AI Agents</TabsTrigger>
          <TabsTrigger value="suggestions" className="data-[state=active]:text-indigo-600 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 shadow-none">Thread Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-white/5 p-6 rounded-xl border border-zinc-200 dark:border-white/10 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* Cột Trái: UI & Access Control */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">UI &amp; Branding</h3>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Welcome Title</label>
                    <Input
                      value={settings.WELCOME_TITLE || ""}
                      onChange={e => setSettings({ ...settings, WELCOME_TITLE: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Welcome Subtitle</label>
                    <Input
                      value={settings.WELCOME_SUBTITLE || ""}
                      onChange={e => setSettings({ ...settings, WELCOME_SUBTITLE: e.target.value })}
                    />
                  </div>
                </div>

                <hr className="border-zinc-200 dark:border-zinc-800" />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Access Control</h3>
                  <div className="flex items-center justify-between pb-2">
                    <div>
                      <p className="font-medium text-red-600 dark:text-red-400">Enable Guest Access</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 max-w-[200px] xl:max-w-[250px]">Cho phép tất cả user Guest được chat với hệ thống mà không bị chặn.</p>
                    </div>
                    <div>
                      <Switch
                        checked={settings.ENABLE_GUEST_ACCESS === "true"}
                        onCheckedChange={checked => setSettings({ ...settings, ENABLE_GUEST_ACCESS: checked ? "true" : "false" })}
                        className="data-[state=checked]:bg-indigo-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cột Phải: AI & Tools */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">AI Configuration</h3>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">System Prompt</label>
                    <Textarea
                      rows={4}
                      value={settings.SYSTEM_PROMPT || ""}
                      onChange={e => setSettings({ ...settings, SYSTEM_PROMPT: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">The foundation prompt for the AI Assistant&apos;s personality and rules.</p>
                  </div>
                </div>

                <hr className="border-zinc-200 dark:border-zinc-800" />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">System Tools Toggles</h3>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable User Memory (Mem0)</p>
                      <p className="text-xs text-muted-foreground">AI ghi nhớ thông tin người dùng để cá nhân hóa cuộc trò chuyện.</p>
                    </div>
                    <div>
                      <Switch
                        checked={settings.ENABLE_MEM0 !== "false"}
                        onCheckedChange={checked => setSettings({ ...settings, ENABLE_MEM0: checked ? "true" : "false" })}
                        className="data-[state=checked]:bg-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable Translate</p>
                      <p className="text-xs text-muted-foreground">Bật chức năng Translate và cho phép AI dịch thuật.</p>
                    </div>
                    <div>
                      <Switch
                        checked={settings.ENABLE_TOOL_TRANSLATE !== "false"}
                        onCheckedChange={checked => setSettings({ ...settings, ENABLE_TOOL_TRANSLATE: checked ? "true" : "false" })}
                        className="data-[state=checked]:bg-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable RAG Search</p>
                      <p className="text-xs text-muted-foreground">Bật chức năng RAG search để tra cứu CSDL kiến thức.</p>
                    </div>
                    <div>
                      <Switch
                        checked={settings.ENABLE_TOOL_RAG_SEARCH !== "false"}
                        onCheckedChange={checked => setSettings({ ...settings, ENABLE_TOOL_RAG_SEARCH: checked ? "true" : "false" })}
                        className="data-[state=checked]:bg-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable Dynamic Agents</p>
                      <p className="text-xs text-muted-foreground">Cho phép sử dụng các tác nhân AI chuyên biệt trong chat.</p>
                    </div>
                    <div>
                      <Switch
                        checked={settings.ENABLE_TOOL_AGENTS !== "false"}
                        onCheckedChange={checked => setSettings({ ...settings, ENABLE_TOOL_AGENTS: checked ? "true" : "false" })}
                        className="data-[state=checked]:bg-indigo-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="pt-6 flex justify-end">
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 px-8">
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="agents">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-full md:w-1/3 space-y-4 shrink-0">
              <form onSubmit={handleCreateAgent} className="bg-white dark:bg-white/5 p-6 rounded-xl border border-zinc-200 dark:border-white/10 space-y-4">
                <h3 className="font-semibold text-lg">Create New AI Agent</h3>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Agent Name</label>
                  <Input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="e.g. Chuyên gia SOP" required />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Icon (Emoji/Lucide name)</label>
                  <Input value={newAgentIcon} onChange={e => setNewAgentIcon(e.target.value)} placeholder="e.g. 🤖, Bot, Chef" />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Description</label>
                  <Input value={newAgentDesc} onChange={e => setNewAgentDesc(e.target.value)} placeholder="Vai trò của agent này..." />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">System Prompt</label>
                  <Textarea rows={6} value={newAgentPrompt} onChange={e => setNewAgentPrompt(e.target.value)} placeholder="Cấu hình hành vi cho agent này..." required />
                </div>
                <Button type="submit" disabled={creating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                  {creating ? "Creating..." : "Create Agent"}
                </Button>
              </form>
            </div>

            <div className="w-full md:w-2/3 space-y-4">
              {agents.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                  No agents created yet. Start by creating one on the left.
                </div>
              ) : (
                agents.map(agent => (
                  <div key={agent.id} className="bg-white dark:bg-white/5 p-4 rounded-xl border border-zinc-200 dark:border-white/10 flex justify-between items-center group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <AgentIcon icon={agent.icon} className="text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h4 className="font-bold flex items-center gap-2">
                          {agent.name}
                          {!agent.is_active && <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded uppercase">Disabled</span>}
                        </h4>
                        <p className="text-sm text-muted-foreground line-clamp-1">{agent.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="outline" size="sm" onClick={() => handleToggleAgentActive(agent.id, agent.is_active)}>
                        {agent.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteAgent(agent.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="suggestions">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Cột Trái: Controls & Form */}
            <div className="w-full md:w-1/3 space-y-4 shrink-0">
              <div className="bg-zinc-100 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white">Auto-Generate Trends</h3>
                  <p className="text-xs text-zinc-500 mt-1">LLM analyzes the latest chat queries every 24h to generate suggestions.</p>
                </div>
                <Button variant="outline" className="w-full border-indigo-200 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10" onClick={handleTriggerCron} disabled={saving}>
                  {saving ? "Wait..." : "Trigger Cron"}
                </Button>
              </div>

              <form onSubmit={handleCreateSuggestion} className="bg-white dark:bg-white/5 p-4 rounded-xl border border-zinc-200 dark:border-white/10 space-y-3">
                <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Create Manual Suggestion</h3>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Title (short)</label>
                  <Input
                    placeholder="VD: Tình trạng MES server hôm nay"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Prompt (complete question sent to AI)</label>
                  <Textarea
                    rows={3}
                    placeholder="VD: Hãy kiểm tra và báo cáo tình trạng hoạt động..."
                    value={newPrompt}
                    onChange={e => setNewPrompt(e.target.value)}
                    required
                    className="resize-none"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20" size="sm" disabled={creating}>
                    {creating ? "Đang tạo..." : "Add Suggestion"}
                  </Button>
                </div>
              </form>
            </div>

            {/* Cột Phải: Scrollable List */}
            <div className="w-full md:w-2/3 max-h-[calc(100vh-480px)] min-h-[400px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {suggestions.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg text-zinc-500 h-32 flex items-center justify-center">
                  No suggestions found. Wait for cron job or trigger it manually!
                </div>
              ) : suggestions.map((sug) => (
                <div key={sug.id} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
                  <div className="space-y-1 w-full max-w-xl">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-indigo-600 dark:text-indigo-400">{sug.title}</h4>
                      {sug.is_auto_generated && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 uppercase tracking-wide">Auto</span>
                      )}
                      {!sug.active && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 uppercase tracking-wide">Hidden</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 title={sug.prompt}">{sug.prompt}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => handleToggleSuggestionActive(sug.id, sug.active)} className="border-indigo-200 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
                      {sug.active ? "Hide" : "Activate"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteSuggestion(sug.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
