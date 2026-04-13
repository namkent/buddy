"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [setRes, sugRes] = await Promise.all([
        fetch("/api/admin/settings"),
        fetch("/api/admin/suggestions")
      ]);
      const setList = await setRes.json();
      const sugList = await sugRes.json();

      const obj: Record<string, string> = {};
      if (Array.isArray(setList)) {
        setList.forEach((s: any) => { obj[s.key] = s.value; });
      }
      setSettings(obj);
      if (Array.isArray(sugList)) setSuggestions(sugList);
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
      alert("Settings saved successfully!");
    } catch {
      alert("Error saving settings");
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
      alert("Error deleting");
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
      alert("Error updating");
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
      alert("Error creating suggestion");
    }
    setCreating(false);
  };

  const handleTriggerCron = async () => {
    if (!confirm("Run cron job to generate suggestions now? (this uses LLM API)")) return;
    setSaving(true);
    try {
      const r = await fetch("/api/cron/suggestions");
      const json = await r.json();
      alert(json.success ? "Generated! Refreshing..." : "Failed: " + json.error);
      await loadSettings();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 animate-pulse text-center">Loading settings...</div>;

  const tabClass = (tab: string) =>
    `px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === tab
      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
    }`;

  return (
    <div className="max-w-4xl w-full mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground mt-2">Manage application configuration, AI behavior, and thread suggestions.</p>
      </div>

      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button onClick={() => setActiveTab("general")} className={tabClass("general")}>General Config</button>
        <button onClick={() => setActiveTab("suggestions")} className={tabClass("suggestions")}>Thread Suggestions</button>
      </div>

      {activeTab === "general" && (
        <form onSubmit={handleSaveSettings} className="space-y-6 bg-white dark:bg-white/5 p-6 rounded-xl border border-zinc-200 dark:border-white/10 shadow-sm">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">UI &amp; Branding</h3>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Welcome Title</label>
              <input
                type="text"
                value={settings.WELCOME_TITLE || ""}
                onChange={e => setSettings({ ...settings, WELCOME_TITLE: e.target.value })}
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Welcome Subtitle</label>
              <input
                type="text"
                value={settings.WELCOME_SUBTITLE || ""}
                onChange={e => setSettings({ ...settings, WELCOME_SUBTITLE: e.target.value })}
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">AI Configuration</h3>
            <div className="grid gap-2">
              <label className="text-sm font-medium">System Prompt</label>
              <textarea
                rows={4}
                value={settings.SYSTEM_PROMPT || ""}
                onChange={e => setSettings({ ...settings, SYSTEM_PROMPT: e.target.value })}
                className="w-full flex min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">The foundation prompt for the AI Assistant&apos;s personality and rules.</p>
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">System Tools Toggles</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Translation Tool</p>
                <p className="text-xs text-muted-foreground">Allows LLM to invoke translation scripts.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.ENABLE_TOOL_TRANSLATE === "true"}
                  onChange={e => setSettings({ ...settings, ENABLE_TOOL_TRANSLATE: e.target.checked ? "true" : "false" })}
                />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-violet-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable RAG Document Search</p>
                <p className="text-xs text-muted-foreground">Allows LLM to fetch chunks from your document storage.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.ENABLE_TOOL_RAG_SEARCH === "true"}
                  onChange={e => setSettings({ ...settings, ENABLE_TOOL_RAG_SEARCH: e.target.checked ? "true" : "false" })}
                />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-violet-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700"></div>
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      )}

      {activeTab === "suggestions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Daily Hot Trends Auto-Generation</h3>
              <p className="text-sm text-zinc-500">LLM analyzes the latest chat queries every 24h to generate suggestions.</p>
            </div>
            <Button variant="outline" onClick={handleTriggerCron} disabled={saving}>
              {saving ? "Wait..." : "Trigger Cron"}
            </Button>
          </div>

          {/* Manual create form */}
          <form onSubmit={handleCreateSuggestion} className="bg-white dark:bg-white/5 p-4 rounded-xl border border-zinc-200 dark:border-white/10 space-y-3">
            <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Create Manual Suggestion</h3>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Title (short)</label>
              <input
                type="text"
                placeholder="VD: Tình trạng MES server hôm nay"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                required
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Prompt (complete question sent to AI)</label>
              <textarea
                rows={2}
                placeholder="VD: Hãy kiểm tra và báo cáo tình trạng hoạt động của các server MES hiện tại."
                value={newPrompt}
                onChange={e => setNewPrompt(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "Đang tạo..." : "Add Suggestion"}
              </Button>
            </div>
          </form>

          <div className="grid gap-4 mt-6">
            {suggestions.length === 0 ? (
              <div className="text-center p-8 border border-dashed rounded-lg text-zinc-500">
                No suggestions found. Wait for cron job or trigger it manually!
              </div>
            ) : suggestions.map((sug) => (
              <div key={sug.id} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="space-y-1 w-full max-w-xl">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-violet-600 dark:text-violet-400">{sug.title}</h4>
                    {sug.is_auto_generated && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 uppercase tracking-wide">Auto</span>
                    )}
                    {!sug.active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 uppercase tracking-wide">Hidden</span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{sug.prompt}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleToggleSuggestionActive(sug.id, sug.active)}>
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
      )}
    </div>
  );
}
