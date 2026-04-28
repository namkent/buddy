"use client";

import { useI18n } from "@/components/i18n/i18n-context";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { US, VN, KR, JP, CN, FR, DE, ES } from 'country-flag-icons/react/3x2';

const LANGUAGES = [
  { code: 'en', name: 'English', Flag: US },
  { code: 'vi', name: 'Tiếng Việt', Flag: VN },
  { code: 'kr', name: '한국어', Flag: KR },
  { code: 'ja', name: '日本語', Flag: JP },
  { code: 'zh', name: '中文', Flag: CN },
  { code: 'fr', name: 'Français', Flag: FR },
  { code: 'de', name: 'Deutsch', Flag: DE },
  { code: 'es', name: 'Español', Flag: ES },
];

export function LanguageToggle() {
  const { lang } = useI18n();
  const router = useRouter();

  const handleLangChange = async (newLang: string) => {
    if (newLang === lang) return;

    try {
      const res = await fetch("/api/user/lang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: newLang })
      });
      if (res.ok) {
        toast.success("Đã thay đổi ngôn ngữ");
        router.refresh();
      }
    } catch (error) {
      toast.error("Lỗi khi thay đổi ngôn ngữ");
    }
  };

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground outline-none focus:outline-none"
          aria-label="Select language"
        >
          <div className="size-5 rounded-full overflow-hidden flex items-center justify-center border border-zinc-200 dark:border-white/10">
            <currentLang.Flag className="w-full h-full object-cover scale-[1.5]" />
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl p-1 min-w-[160px] dark:bg-zinc-950 dark:border-white/10 shadow-2xl">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem 
            key={l.code} 
            onClick={() => handleLangChange(l.code)}
            className={`gap-3 rounded-lg cursor-pointer py-2 ${lang === l.code ? 'bg-violet-500/10 text-violet-500' : 'hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400'}`}
          >
            <div className="w-6 h-4 overflow-hidden rounded-sm shadow-sm">
              <l.Flag className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-semibold">{l.name}</span>
            {lang === l.code && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
