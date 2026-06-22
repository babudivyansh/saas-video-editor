"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEditorStore } from "@/app/components/video-editor/store/editorStore";
import VideoEditor from "@/app/components/video-editor/VideoEditor";
import { emptyTrackDoc } from "@/lib/track-editor-types";
import type { TrackDoc } from "@/lib/track-editor-types";

function authToken() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string;
  const loadDoc = useEditorStore(s => s.loadDoc);

  // Verify session is still valid; redirect to auth if not
  useEffect(() => {
    const token = authToken();
    if (!token) { router.replace("/auth"); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (r.status === 401) router.replace("/auth"); })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!projectId || projectId === "new") {
      loadDoc(emptyTrackDoc(), "", "Untitled Project");
      return;
    }

    fetch(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    })
      .then(r => r.json())
      .then(({ project }) => {
        if (!project) return;
        const raw = project.editorDoc as { _v?: number } | null;
        if (raw?._v === 2) {
          loadDoc(raw as TrackDoc, project.id, project.title ?? "Untitled Project");
        } else {
          loadDoc(emptyTrackDoc(), project.id, project.title ?? "Untitled Project");
        }
      })
      .catch(() => {
        loadDoc(emptyTrackDoc(), "", "Untitled Project");
      });
  }, [projectId, loadDoc]);

  return <VideoEditor />;
}
