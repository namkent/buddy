"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  Plus, Search, Filter, Languages, Save, Trash2, 
  Loader2, Pencil, Sparkles, X 
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "next-auth/react";

const LANGS = ['en', 'vi', 'kr', 'ja', 'zh', 'fr', 'de', 'es'];

export default function AdminI18nPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTypeName, setNewTypeName] = useState("");

  const [formData, setFormData] = useState<any>({
    type: "label",
    key: "",
    en: "",
    vi: "",
    kr: "",
    ja: "",
    zh: "",
    fr: "",
    de: "",
    es: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resI18n, resTypes] = await Promise.all([
        fetch("/api/i18n/admin"),
        fetch("/api/i18n/types")
      ]);
      const i18nData = await resI18n.json();
      const typesData = await resTypes.json();
      setData(i18nData);
      setTypes(typesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!formData.type || !formData.key) return alert("Type and Key are required!");

    const res = await fetch("/api/i18n/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });

    if (res.ok) {
      setIsModalOpen(false);
      fetchData();
    } else {
      const err = await res.json();
      alert("Error: " + (err.error || "Unknown error"));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this translation?")) return;
    const res = await fetch(`/api/i18n/admin?id=${id}`, { method: "DELETE" });
    if (res.ok) fetchData();
  };

  const handleAutoTranslate = async () => {
    const source = formData.en || formData.vi;
    if (!source) return alert("Please enter at least English or Vietnamese to translate from.");

    setIsTranslating(true);
    try {
      const res = await fetch("/api/i18n/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const translations = await res.json();
      setFormData({ ...formData, ...translations });
    } catch (err) {
      alert("Translation failed");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAddType = async () => {
    if (!newTypeName) return;
    await fetch("/api/i18n/types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTypeName })
    });
    setNewTypeName("");
    fetchData();
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      type: types[0] || "label",
      key: "",
      en: "",
      vi: "",
      kr: "",
      ja: "",
      zh: "",
      fr: "",
      de: "",
      es: ""
    });
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setFormData(item);
    setIsModalOpen(true);
  };

  const filtered = data.filter(t => {
    const matchesSearch = t.key.toLowerCase().includes(search.toLowerCase()) || 
                          t.en?.toLowerCase().includes(search.toLowerCase()) || 
                          t.vi?.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesType;
  });

  if ((session?.user as any)?.role !== 'admin') {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">Language Management</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-base">Manage dynamic translations for the entire system using AI.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsTypeModalOpen(true)} className="h-9 border-zinc-200 dark:border-white/10 bg-white/50 dark:bg-white/5">
            Manage Types
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setIsModalOpen(true); }} className="h-9 bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 px-4">
            <Plus className="size-4 mr-2" /> Add Translation
          </Button>
        </div>
      </div>

      {/* Filters Area */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-1">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <Input
            placeholder="Search by key or content..."
            className="pl-10 h-9 bg-white/50 dark:bg-white/5 border-zinc-200 dark:border-white/10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40 h-9 bg-white/50 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-xs">
              <div className="flex items-center gap-2">
                <Filter className="size-3.5 text-zinc-400" />
                <SelectValue placeholder="Filter by type" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">
            Total: {filtered.length}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden shadow-sm flex flex-col min-h-0">
        {/* Table Header Container (Fixed) */}
        <div className="bg-zinc-100/50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/10 shrink-0">
          <table className="w-full table-fixed text-sm border-separate border-spacing-0">
            <thead className="text-zinc-500 dark:text-zinc-400 uppercase text-[10px] font-bold tracking-widest">
              <tr className="h-12">
                <th className="w-[120px] px-6 py-4 text-left">Type</th>
                <th className="w-[180px] px-6 py-4 text-left">Key</th>
                <th className="px-6 py-4 text-left">English</th>
                <th className="px-6 py-4 text-left">Vietnamese</th>
                <th className="w-[160px] px-6 py-4 text-center">Languages</th>
                <th className="w-[100px] px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Table Body Container (Scrollable) */}
        <div className="overflow-auto max-h-[70vh] custom-scrollbar">
          <table className="w-full table-fixed text-sm border-separate border-spacing-0">
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 animate-pulse">
                    Loading translations...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 italic">
                    No translations found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors border-b border-zinc-100 dark:border-white/5 group">
                    <td className="w-[120px] px-6 py-4">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase font-bold text-violet-500 border-violet-500/20 bg-violet-500/5">
                        {item.type}
                      </Badge>
                    </td>
                    <td className="w-[180px] px-6 py-4 font-mono text-[11px] text-zinc-500 truncate" title={item.key}>
                      {item.key}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-zinc-700 dark:text-zinc-300 truncate" title={item.en}>
                      {item.en}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-zinc-700 dark:text-zinc-300 truncate" title={item.vi}>
                      {item.vi}
                    </td>
                    <td className="w-[160px] px-6 py-4">
                      <div className="flex gap-1 flex-wrap justify-center">
                        {LANGS.filter(l => l !== 'en' && l !== 'vi').map(l => (
                          item[l] && <Badge key={l} variant="secondary" className="text-[9px] px-1 py-0 uppercase dark:bg-zinc-800 dark:text-zinc-400 border-none font-bold">{l}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="w-[100px] px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} className="size-8 text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10" title="Edit Translation">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="size-8 text-zinc-500 hover:text-red-600 hover:bg-red-500/10" title="Delete Translation">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl dark:bg-zinc-950 dark:border-white/10 p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold dark:text-zinc-100">
              <Sparkles className="size-5 text-violet-500" />
              {editingId ? "Edit Translation" : "Add New Translation"}
            </DialogTitle>
            <DialogDescription className="dark:text-zinc-400">
              Enter key and translations. Priority: English &gt; Vietnamese for AI auto-translate.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Type</label>
              <Select 
                value={formData.type} 
                onValueChange={(v) => setFormData({...formData, type: v})}
              >
                <SelectTrigger className="h-10 rounded-lg bg-zinc-50 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="dark:bg-zinc-900 dark:border-white/10">
                  {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Key</label>
              <Input 
                value={formData.key} 
                onChange={(e) => setFormData({...formData, key: e.target.value})}
                placeholder="e.g. welcome_msg"
                className="h-10 rounded-lg bg-zinc-50 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 text-sm"
              />
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-4 bg-zinc-100/50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-white/10">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="size-2 rounded-full bg-blue-600"></span> English (en)
                </label>
                <Input 
                  value={formData.en} 
                  onChange={(e) => setFormData({...formData, en: e.target.value})}
                  className="h-10 rounded-lg bg-white dark:bg-zinc-800 dark:border-white/10 dark:text-zinc-100 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="size-2 rounded-full bg-red-600"></span> Vietnamese (vi)
                </label>
                <Input 
                  value={formData.vi} 
                  onChange={(e) => setFormData({...formData, vi: e.target.value})}
                  className="h-10 rounded-lg bg-white dark:bg-zinc-800 dark:border-white/10 dark:text-zinc-100 text-sm"
                />
              </div>
              <div className="col-span-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleAutoTranslate}
                  disabled={isTranslating}
                  className="w-full h-10 bg-white dark:bg-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/30 gap-2 rounded-lg font-bold text-xs uppercase tracking-wide"
                >
                  {isTranslating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Auto-translate all languages via AI
                </Button>
              </div>
            </div>

            <div className="col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
              {LANGS.filter(l => l !== 'en' && l !== 'vi').map(l => (
                <div key={l} className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">{l}</label>
                  <Input 
                    value={formData[l] || ""} 
                    onChange={(e) => setFormData({...formData, [l]: e.target.value})}
                    className="h-8 text-xs rounded-md bg-zinc-50 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)} className="dark:text-zinc-400 dark:hover:text-zinc-100 font-bold uppercase text-[11px] tracking-widest">Cancel</Button>
            <Button size="sm" onClick={handleSave} className="bg-violet-600 hover:bg-violet-700 gap-2 rounded-lg text-white font-bold uppercase text-[11px] tracking-widest px-6 shadow-lg shadow-violet-500/20">
              <Save className="size-4" /> Save Translation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Manage Types */}
      <Dialog open={isTypeModalOpen} onOpenChange={setIsTypeModalOpen}>
        <DialogContent className="rounded-2xl max-w-sm dark:bg-zinc-950 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold dark:text-zinc-100 uppercase tracking-wide">Manage Types</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input 
                placeholder="New type name..." 
                value={newTypeName} 
                onChange={(e) => setNewTypeName(e.target.value)}
                className="h-9 rounded-lg dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 text-sm"
              />
              <Button size="sm" onClick={handleAddType} className="bg-violet-600 hover:bg-violet-700 text-white font-bold uppercase text-[10px] tracking-widest">Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {types.map(t => (
                <Badge key={t} variant="secondary" className="px-3 py-1 flex items-center gap-2 rounded-lg dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-white/10 font-bold text-[10px] uppercase">
                  {t}
                  <button onClick={async () => {
                    if (confirm(`Delete type ${t}?`)) {
                      await fetch(`/api/i18n/types?name=${t}`, { method: "DELETE" });
                      fetchData();
                    }
                  }}>
                    <X className="size-3 hover:text-red-500 transition-colors" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
