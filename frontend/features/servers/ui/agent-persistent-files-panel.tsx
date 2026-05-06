"use client";

import * as React from "react";
import { Files } from "lucide-react";

import { DocumentViewer } from "@/features/chat/components/execution/file-panel/document-viewer";
import {
  FileSidebar,
  downloadFileFromUrl,
} from "@/features/chat/components/execution/file-panel/file-sidebar";
import type { FileNode } from "@/features/chat/types";
import { useT } from "@/lib/i18n/client";

function findFirstFile(nodes: FileNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.type === "file") {
      return node;
    }
    if (node.children?.length) {
      const child = findFirstFile(node.children);
      if (child) {
        return child;
      }
    }
  }
  return null;
}

export function AgentPersistentFilesPanel({
  files,
  isLoading,
  fileListLayoutClassName = "lg:grid-cols-[minmax(0,1fr)_minmax(12rem,14rem)]",
}: {
  files: FileNode[];
  isLoading: boolean;
  fileListLayoutClassName?: string;
}) {
  const { t } = useT("translation");
  const [selectedFile, setSelectedFile] = React.useState<FileNode | undefined>();

  React.useEffect(() => {
    const nextFile = findFirstFile(files) ?? undefined;
    setSelectedFile((current) => {
      if (!current) {
        return nextFile;
      }
      const visit = (nodes: FileNode[]): boolean =>
        nodes.some(
          (node) =>
            node.id === current.id ||
            (node.children?.length ? visit(node.children) : false),
        );
      return visit(files) ? current : nextFile;
    });
  }, [files]);

  const handleDownloadNode = React.useCallback(async (node: FileNode) => {
    if (node.type !== "file" || !node.url) {
      return;
    }
    await downloadFileFromUrl(node.url, node.name);
  }, []);

  return (
    <div className="overflow-hidden rounded-md bg-background">
      <div
        className={`grid min-h-[24rem] grid-cols-1 ${fileListLayoutClassName}`}
      >
        <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
                  {t("conversationView.loading")}
                </div>
              ) : selectedFile ? (
                <DocumentViewer file={selectedFile} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <div className="space-y-3">
                    <Files className="mx-auto size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {t("conversationView.sharedArtifacts.empty")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="min-h-0 overflow-hidden bg-muted/20">
          <FileSidebar
            files={files}
            onFileSelect={setSelectedFile}
            selectedFile={selectedFile}
            embedded
            onDownloadNode={(node) => void handleDownloadNode(node)}
          />
        </div>
      </div>
    </div>
  );
}
