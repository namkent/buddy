"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { 
  Bold, Italic, Underline as UnderlineIcon, 
  List, ListOrdered, Image as ImageIcon, 
  Link as LinkIcon, Quote, Code, Heading1, Heading2, Undo, Redo 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt("URL hình ảnh:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL liên kết:", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10">
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive("bold") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <Bold className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive("italic") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <Italic className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive("underline") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <UnderlineIcon className="size-4" />
      </Button>
      <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1 self-center" />
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive("heading", { level: 1 }) ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <Heading1 className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive("heading", { level: 2 }) ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <Heading2 className="size-4" />
      </Button>
      <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1 self-center" />
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive("bulletList") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <List className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive("orderedList") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <ListOrdered className="size-4" />
      </Button>
      <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1 self-center" />
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={editor.isActive("blockquote") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <Quote className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={editor.isActive("codeBlock") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <Code className="size-4" />
      </Button>
      <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1 self-center" />
      <Button variant="ghost" size="sm" onClick={setLink} className={editor.isActive("link") ? "bg-zinc-200 dark:bg-zinc-800" : ""}>
        <LinkIcon className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={addImage}>
        <ImageIcon className="size-4" />
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="size-4" />
      </Button>
    </div>
  );
};

export default function TiptapEditor({ content, onChange, placeholder }: TiptapEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Image.configure({
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || "Nhập nội dung tại đây...",
      }),
    ],
    content: content,
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3 cursor-text",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Đồng bộ content từ bên ngoài (nếu cần reset)
  useEffect(() => {
    if (editor && content === "" && editor.getHTML() !== "") {
        editor.commands.setContent("");
    }
  }, [content, editor]);

  return (
    <div className="flex flex-col w-full h-full border rounded-md overflow-hidden bg-white dark:bg-zinc-950">
      <MenuBar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
