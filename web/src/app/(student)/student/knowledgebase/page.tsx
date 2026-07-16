"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  Library,
  Tag,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchStudentKnowledgebase, resolveFileUrl } from "@/lib/api";

export default function StudentKnowledgebase() {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchStudentKnowledgebase()
      .then((res) => {
        setResources(res);
      })
      .catch((err) => {
        console.error("Failed to load knowledgebase resources", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleDownload = (fileUrl: string | null, fileName: string | null) => {
    if (!fileUrl) return;
    const resolved = resolveFileUrl(fileUrl);
    window.open(resolved, "_blank", "noopener,noreferrer");
  };

  const filteredResources = resources.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.courseTitle.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query)) ||
      item.category.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <>
        <Topbar title="Knowledge Base" subtitle="Learning materials" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading study materials...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Knowledge Base" subtitle="Access syllabuses, notes, guides, and homework worksheets" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Search Bar */}
        <div className="max-w-md">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              placeholder="Search resource files, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-2xl border border-hairline bg-surface pr-4 pl-11 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200"
            />
          </label>
        </div>

        {/* Resources Grid */}
        {filteredResources.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-up">
            {filteredResources.map((item) => {
              const isLink = item.format.toLowerCase() === "link";
              return (
                <Card
                  key={item.id}
                  className="border border-hairline bg-surface rounded-3xl p-5 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Header badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <Badge tone="accent" className="font-extrabold text-[8px] uppercase tracking-wider px-1.5">
                          {item.format}
                        </Badge>
                        {!isLink && (
                          <span className="block text-[10px] text-ink-3 font-semibold">
                            Size: {item.sizeMB} MB
                          </span>
                        )}
                      </div>
                      <div className="size-9 rounded-xl bg-accent-soft/20 text-accent flex items-center justify-center">
                        <FileText className="size-4.5" />
                      </div>
                    </div>

                    {/* Description details */}
                    <div className="space-y-2">
                      <h3 className="font-extrabold text-sm text-ink leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-ink-3 leading-relaxed line-clamp-2">
                        {item.description || "No material overview provided. Download resource to read full detail."}
                      </p>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-ink-3 font-bold border-t border-hairline/80 pt-3">
                      <span className="flex items-center gap-1">
                        <BookOpen className="size-3.5" />
                        {item.courseTitle}
                      </span>
                      <span className="flex items-center gap-1">
                        <Tag className="size-3.5" />
                        {item.category}
                      </span>
                    </div>
                  </div>

                  {item.fileUrl && (
                    <div className="pt-4.5">
                      <Button
                        onClick={() => handleDownload(item.fileUrl, item.fileName)}
                        className="bg-accent hover:bg-accent-hover text-white text-xs font-extrabold h-9 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm w-full justify-center"
                      >
                        {isLink ? (
                          <>
                            <ExternalLink className="size-3.5" />
                            Open Resource Link
                          </>
                        ) : (
                          <>
                            <Download className="size-3.5" />
                            Download Document File
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="border border-hairline/80 rounded-3xl bg-surface py-20 text-center shadow-sm max-w-md mx-auto space-y-4">
            <Library className="size-10 text-ink-3/40 mx-auto" />
            <h3 className="font-extrabold text-sm text-ink">No Documents Found</h3>
            <p className="text-xs text-ink-3 leading-relaxed px-6">
              {searchQuery
                ? "No resource files matched your search filters. Try typing a different query."
                : "No learning materials or worksheets have been shared for your enrolled courses yet."}
            </p>
          </div>
        )}
      </main>
    </>
  );
}
