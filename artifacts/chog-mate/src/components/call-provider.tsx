import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  callAction,
  callHeartbeat,
  createCall,
  getCall,
  getGetAuthSessionQueryKey,
  getGetIncomingCallsQueryKey,
  getIncomingCalls,
  pollCallSignals,
  sendCallSignal,
  useGetAuthSession,
  type CallSession,
  type IncomingCall,
  type Profile,
} from "@workspace/api-client-react";
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, Video } from "lucide-react";
import { ProfileAvatar } from "@/components/shared";

type CallMode = "audio" | "video";
type CallRole = "caller" | "receiver";

interface ActiveCall {
  call: CallSession;
  profile: Profile;
  role: CallRole;
}

type CallSignalMessage = Awaited<ReturnType<typeof pollCallSignals>>[number];

interface CallContextValue {
  activeCall: ActiveCall | null;
  busy: boolean;
  startCall: (matchId: string, type: CallMode, profile: Profile) => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useCallControls(): CallContextValue {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCallControls must be used inside CallProvider.");
  return value;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useGetAuthSession({
    query: {
      queryKey: getGetAuthSessionQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 0,
    },
  });
  const authenticated = session.data?.authenticated === true && !session.isError;
  const incomingQuery = useQuery({
    queryKey: getGetIncomingCallsQueryKey(),
    queryFn: () => getIncomingCalls(),
    enabled: authenticated,
    refetchInterval: authenticated ? 2_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const hasIncomingCall = (incomingQuery.data?.length ?? 0) > 0;

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalCursorRef = useRef(0);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [notice, setNotice] = useState("");
  const noticeTimeoutRef = useRef<number | null>(null);

  const setBusyState = useCallback((next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimeoutRef.current = null;
    }, 6_000);
  }, []);

  const stopMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    signalCursorRef.current = 0;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraEnabled(true);
  }, []);

  const clearActiveCall = useCallback((callId?: string) => {
    if (callId && activeCallRef.current?.call.id !== callId) return;
    activeCallRef.current = null;
    setActiveCall(null);
    stopMedia();
  }, [stopMedia]);

  const updateActiveCall = useCallback((call: CallSession) => {
    setActiveCall((current) => {
      if (!current || current.call.id !== call.id) return current;
      const next = { ...current, call };
      activeCallRef.current = next;
      return next;
    });
  }, []);

  const markCallFailed = useCallback(async (callId: string, message: string) => {
    try {
      await callAction(callId, { action: "failed" });
    } catch {
      // The other participant or server may already have ended this call.
    }
    if (activeCallRef.current?.call.id === callId) {
      clearActiveCall(callId);
      showNotice(message);
    }
  }, [clearActiveCall, showNotice]);

  const startCall = useCallback(async (
    matchId: string,
    type: CallMode,
    profile: Profile,
  ) => {
    if (busyRef.current || activeCallRef.current || hasIncomingCall) {
      showNotice("You already have an active or incoming call.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      showNotice("This browser does not support audio and video calls.");
      return;
    }
    setBusyState(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        type === "video"
          ? { audio: true, video: { facingMode: "user" } }
          : { audio: true, video: false },
      );
      localStreamRef.current = stream;
      setLocalStream(stream);
      const call = await createCall({ matchId, type });
      const next = { call, profile, role: "caller" as const };
      activeCallRef.current = next;
      setActiveCall(next);
      signalCursorRef.current = 0;
      await queryClient
        .invalidateQueries({ queryKey: getGetIncomingCallsQueryKey() })
        .catch(() => undefined);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (localStreamRef.current === stream) {
        localStreamRef.current = null;
        setLocalStream(null);
      }
      showNotice(callErrorMessage(error));
    } finally {
      setBusyState(false);
    }
  }, [hasIncomingCall, queryClient, setBusyState, showNotice]);

  const acceptCall = useCallback(async (incoming: IncomingCall) => {
    if (busyRef.current || activeCallRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      showNotice("This browser does not support audio and video calls.");
      return;
    }
    setBusyState(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        incoming.type === "video"
          ? { audio: true, video: { facingMode: "user" } }
          : { audio: true, video: false },
      );
      const call = await callAction(incoming.id, { action: "accept" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const next = { call, profile: incoming.profile, role: "receiver" as const };
      activeCallRef.current = next;
      setActiveCall(next);
      signalCursorRef.current = 0;
      await queryClient
        .invalidateQueries({ queryKey: getGetIncomingCallsQueryKey() })
        .catch(() => undefined);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (localStreamRef.current === stream) {
        localStreamRef.current = null;
        setLocalStream(null);
      }
      try {
        await callAction(incoming.id, { action: "failed" });
      } catch {
        // The call may have expired or been ended by the caller.
      }
      showNotice(callErrorMessage(error, "The call could not be accepted."));
    } finally {
      setBusyState(false);
    }
  }, [queryClient, setBusyState, showNotice]);

  const declineCall = useCallback(async (incoming: IncomingCall) => {
    if (busyRef.current) return;
    setBusyState(true);
    try {
      await callAction(incoming.id, { action: "decline" });
      await queryClient
        .invalidateQueries({ queryKey: getGetIncomingCallsQueryKey() })
        .catch(() => undefined);
    } catch (error) {
      showNotice(callErrorMessage(error, "The call could not be declined."));
    } finally {
      setBusyState(false);
    }
  }, [queryClient, setBusyState, showNotice]);

  const endCall = useCallback(async () => {
    const call = activeCallRef.current?.call;
    if (!call || busyRef.current) return;
    setBusyState(true);
    try {
      await callAction(call.id, { action: "end" });
    } catch {
      // Always release the local devices even if the server is unavailable.
    } finally {
      clearActiveCall(call.id);
      setBusyState(false);
    }
  }, [clearActiveCall, setBusyState]);

  useEffect(() => {
    const current = activeCall;
    if (!current) return;

    let cancelled = false;
    let pollInFlight = false;
    let disconnectedTimeout: number | null = null;
    let intervalId: number | null = null;
    let lastHeartbeat = 0;
    let failureCount = 0;
    const queuedCandidates: RTCIceCandidateInit[] = [];
    const peer = new RTCPeerConnection(rtcConfiguration);
    peerRef.current = peer;
    const stream = localStreamRef.current;
    stream?.getTracks().forEach((track) => peer.addTrack(track, stream));

    const sendSignal = async (
      signalType: "offer" | "answer" | "ice_candidate",
      payload: {
        type?: "offer" | "answer";
        sdp?: string;
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      },
    ) => {
      if (cancelled) return;
      await sendCallSignal(current.call.id, { signalType, payload });
    };

    const applyQueuedCandidates = async () => {
      if (!peer.remoteDescription) return;
      while (queuedCandidates.length > 0) {
        const candidate = queuedCandidates.shift();
        if (candidate) await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    peer.ontrack = (event) => {
      if (cancelled) return;
      let incoming = event.streams[0] ?? remoteStreamRef.current;
      if (!incoming) incoming = new MediaStream();
      if (!event.streams[0] && !incoming.getTracks().some((track) => track.id === event.track.id)) {
        incoming.addTrack(event.track);
      }
      remoteStreamRef.current = incoming;
      setRemoteStream(incoming);
    };
    peer.onicecandidate = (event) => {
      if (!event.candidate || cancelled) return;
      const candidate = event.candidate.toJSON();
      void sendSignal("ice_candidate", {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      }).catch(() => {
        void markCallFailed(current.call.id, "The call connection was interrupted.");
      });
    };
    peer.onconnectionstatechange = () => {
      if (cancelled) return;
      if (peer.connectionState === "connected") {
        if (disconnectedTimeout !== null) {
          window.clearTimeout(disconnectedTimeout);
          disconnectedTimeout = null;
        }
        void callAction(current.call.id, { action: "connected" })
          .then(updateActiveCall)
          .catch(() => undefined);
      } else if (peer.connectionState === "failed") {
        void markCallFailed(current.call.id, "The call could not connect. Check your network and try again.");
      } else if (peer.connectionState === "disconnected" && disconnectedTimeout === null) {
        disconnectedTimeout = window.setTimeout(() => {
          if (peer.connectionState === "disconnected") {
            void markCallFailed(current.call.id, "The call connection was lost.");
          }
        }, 15_000);
      }
    };

    const handleSignal = async (signal: CallSignalMessage) => {
      if (signal.signalType === "offer") {
        if (
          current.role !== "receiver" ||
          peer.remoteDescription ||
          signal.payload.type !== "offer" ||
          !signal.payload.sdp
        ) return;
        await peer.setRemoteDescription({
          type: "offer",
          sdp: signal.payload.sdp,
        });
        await applyQueuedCandidates();
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal("answer", {
          type: "answer",
          sdp: answer.sdp ?? "",
        });
      } else if (signal.signalType === "answer") {
        if (
          current.role !== "caller" ||
          peer.remoteDescription ||
          signal.payload.type !== "answer" ||
          !signal.payload.sdp
        ) return;
        await peer.setRemoteDescription({
          type: "answer",
          sdp: signal.payload.sdp,
        });
        await applyQueuedCandidates();
      } else if (signal.signalType === "ice_candidate" && signal.payload.candidate) {
        const candidate: RTCIceCandidateInit = {
          candidate: signal.payload.candidate,
          sdpMid: signal.payload.sdpMid ?? null,
          sdpMLineIndex: signal.payload.sdpMLineIndex ?? null,
          usernameFragment: signal.payload.usernameFragment ?? null,
        };
        if (peer.remoteDescription) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          queuedCandidates.push(candidate);
        }
      }
    };

    const poll = async () => {
      if (cancelled || pollInFlight) return;
      pollInFlight = true;
      try {
        const latestCall = await getCall(current.call.id);
        if (cancelled) return;
        if (["ended", "rejected", "missed", "failed"].includes(latestCall.status)) {
          const outcome = latestCall.status === "rejected"
            ? "Call declined."
            : latestCall.status === "missed"
              ? "Call was not answered."
              : latestCall.status === "failed"
                ? "The call could not connect."
                : "Call ended.";
          clearActiveCall(current.call.id);
          showNotice(outcome);
          return;
        }
        updateActiveCall(latestCall);

        const signals = await pollCallSignals(current.call.id, signalCursorRef.current);
        for (const signal of signals) {
          if (cancelled) return;
          signalCursorRef.current = Math.max(signalCursorRef.current, signal.id);
          await handleSignal(signal);
        }
        if (Date.now() - lastHeartbeat >= 10_000) {
          await callHeartbeat(current.call.id);
          lastHeartbeat = Date.now();
        }
        failureCount = 0;
      } catch {
        failureCount += 1;
        if (failureCount >= 6) {
          void markCallFailed(current.call.id, "The call connection was lost.");
        }
      } finally {
        pollInFlight = false;
      }
    };

    if (current.role === "caller") {
      void (async () => {
        try {
          const offer = await peer.createOffer();
          if (cancelled) return;
          await peer.setLocalDescription(offer);
          await sendSignal("offer", { type: "offer", sdp: offer.sdp ?? "" });
        } catch {
          void markCallFailed(current.call.id, "The call could not be started.");
        }
      })();
    }
    void poll();
    intervalId = window.setInterval(() => void poll(), 1_500);

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      if (disconnectedTimeout !== null) window.clearTimeout(disconnectedTimeout);
      if (peerRef.current === peer) {
        peer.close();
        peerRef.current = null;
      }
    };
  }, [activeCall?.call.id, activeCall?.role, clearActiveCall, markCallFailed, showNotice, updateActiveCall]);

  useEffect(() => {
    if (authenticated) return;
    clearActiveCall();
    setBusyState(false);
  }, [authenticated, clearActiveCall, setBusyState]);

  useEffect(() => () => {
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const toggleMicrophone = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = enabled; });
    setMuted(!enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (!tracks.length) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = enabled; });
    setCameraEnabled(enabled);
  }, []);

  const contextValue = useMemo(
    () => ({ activeCall, busy, startCall }),
    [activeCall, busy, startCall],
  );
  const incoming = incomingQuery.data?.[0] ?? null;

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <CallOverlay
        activeCall={activeCall}
        incoming={incoming}
        localStream={localStream}
        remoteStream={remoteStream}
        muted={muted}
        cameraEnabled={cameraEnabled}
        busy={busy}
        notice={notice}
        onAccept={(call) => void acceptCall(call)}
        onDecline={(call) => void declineCall(call)}
        onEnd={() => void endCall()}
        onToggleMicrophone={toggleMicrophone}
        onToggleCamera={toggleCamera}
      />
    </CallContext.Provider>
  );
}

function CallOverlay({
  activeCall,
  incoming,
  localStream,
  remoteStream,
  muted,
  cameraEnabled,
  busy,
  notice,
  onAccept,
  onDecline,
  onEnd,
  onToggleMicrophone,
  onToggleCamera,
}: {
  activeCall: ActiveCall | null;
  incoming: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  busy: boolean;
  notice: string;
  onAccept: (call: IncomingCall) => void;
  onDecline: (call: IncomingCall) => void;
  onEnd: () => void;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;
    video.srcObject = localStream;
    if (localStream) void video.play().catch(() => undefined);
  }, [localStream]);
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = remoteStream;
    if (remoteStream) void video.play().catch(() => undefined);
  }, [remoteStream]);
  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.srcObject = remoteStream;
    if (!remoteStream) {
      setAudioPlaybackBlocked(false);
      return;
    }
    let cancelled = false;
    void audio.play().then(() => {
      if (!cancelled) setAudioPlaybackBlocked(false);
    }).catch(() => {
      if (!cancelled) setAudioPlaybackBlocked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [remoteStream, activeCall?.call.id]);

  const enableRemoteAudio = async () => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setAudioPlaybackBlocked(false);
    } catch {
      setAudioPlaybackBlocked(true);
    }
  };

  return <>
    {incoming && !activeCall && (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-[#1c152be8] p-4" role="presentation">
        <section
          className="surface w-full max-w-md rounded-[28px] p-6 text-center shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incoming-call-title"
          data-testid="dialog-incoming-call"
        >
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#eee5fb] text-[#7047ff]">
            {incoming.type === "video" ? <Video size={26}/> : <Phone size={26}/>}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[.16em] text-[#8a76a0]">
            Incoming {incoming.type} call
          </p>
          <h2 id="incoming-call-title" className="display mt-2 text-2xl font-extrabold text-[#24133f]">
            {incoming.profile.displayName}
          </h2>
          <div className="mt-3 flex items-center justify-center gap-3">
            <ProfileAvatar profile={incoming.profile} size="md"/>
            <div className="text-left">
              <p className="text-sm font-semibold text-[#51445f]">@{incoming.profile.username}</p>
              <p className="text-xs text-[#82778c]">Chog #{incoming.profile.chog.tokenId}</p>
            </div>
          </div>
          <div className="mt-7 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => onDecline(incoming)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-[#f3e8e9] px-5 py-3 text-sm font-bold text-[#914c58] disabled:opacity-50"
              data-testid="button-decline-call"
            >
              <PhoneOff size={16}/>Decline
            </button>
            <button
              type="button"
              onClick={() => onAccept(incoming)}
              disabled={busy}
              className="button-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold disabled:opacity-50"
              data-testid="button-accept-call"
            >
              <Phone size={16}/>{busy ? "Connecting…" : "Accept"}
            </button>
          </div>
        </section>
      </div>
    )}

    {activeCall && (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-[#1c152be8] p-4">
        <section
          className="surface w-full max-w-3xl overflow-hidden rounded-[28px] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="active-call-title"
          data-testid="dialog-active-call"
        >
          <header className="flex items-center justify-between border-b border-[#24133f12] px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar profile={activeCall.profile} size="sm"/>
              <div className="min-w-0">
                <h2 id="active-call-title" className="truncate font-bold text-[#35264b]">
                  {activeCall.profile.displayName}
                </h2>
                <p className="text-xs capitalize text-[#887c90]">
                  {callStatusLabel(activeCall)}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-[#f2ecff] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6246b0]">
              {activeCall.call.type} call
            </span>
          </header>
          {activeCall.call.type === "video" ? (
            <div className="relative aspect-video bg-[#191420]">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                aria-label="Video from the other caller"
              />
              {!remoteStream && <p className="absolute inset-0 grid place-items-center text-sm text-white/75">Waiting for the other caller…</p>}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 aspect-video w-1/4 rounded-xl border border-white/40 bg-black object-cover shadow-xl"
                aria-label="Your camera preview"
              />
              {!cameraEnabled && <span className="absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">Camera off</span>}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#f7f2ff_0,transparent_68%)] p-8">
              <ProfileAvatar profile={activeCall.profile} size="lg"/>
              <p className="mt-4 text-sm text-[#82778c]">
                {remoteStream ? "Audio connected" : "Waiting for the other caller…"}
              </p>
            </div>
          )}
          <audio ref={remoteAudioRef} autoPlay className="sr-only" aria-label="Audio from the other caller"/>
          <footer className="flex flex-wrap items-center justify-center gap-3 px-5 py-5">
            {audioPlaybackBlocked && (
              <button
                type="button"
                onClick={() => void enableRemoteAudio()}
                className="rounded-full bg-[#f2ecff] px-4 py-2 text-sm font-bold text-[#6246b0]"
                data-testid="button-enable-call-audio"
              >
                Tap to enable call audio
              </button>
            )}
            <button
              type="button"
              onClick={onToggleMicrophone}
              className={`grid h-12 w-12 place-items-center rounded-full ${muted ? "bg-[#f3e8e9] text-[#914c58]" : "bg-[#eee7fb] text-[#6246b0]"}`}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
              data-testid="button-toggle-microphone"
            >
              {muted ? <MicOff size={19}/> : <Mic size={19}/>}
            </button>
            {activeCall.call.type === "video" && (
              <button
                type="button"
                onClick={onToggleCamera}
                className={`grid h-12 w-12 place-items-center rounded-full ${cameraEnabled ? "bg-[#eee7fb] text-[#6246b0]" : "bg-[#f3e8e9] text-[#914c58]"}`}
                aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
                aria-pressed={!cameraEnabled}
                data-testid="button-toggle-camera"
              >
                {cameraEnabled ? <Camera size={19}/> : <CameraOff size={19}/>}
              </button>
            )}
            <button
              type="button"
              onClick={onEnd}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#bb3d58] px-5 text-sm font-bold text-white hover:bg-[#a52f49]"
              data-testid="button-end-call"
            >
              <PhoneOff size={17}/>End call
            </button>
          </footer>
        </section>
      </div>
    )}

    {notice && !activeCall && !incoming && (
      <div className="fixed bottom-5 right-5 z-[110] max-w-sm rounded-2xl bg-[#24133f] px-4 py-3 text-sm font-semibold text-white shadow-xl" role="status" data-testid="call-notice">
        {notice}
      </div>
    )}
  </>;
}

function callStatusLabel(activeCall: ActiveCall): string {
  if (activeCall.call.status === "calling") {
    return activeCall.role === "caller" ? "Calling…" : "Incoming call";
  }
  if (activeCall.call.status === "connecting") return "Connecting…";
  if (activeCall.call.status === "connected") return "Connected";
  return activeCall.call.status;
}

function callErrorMessage(error: unknown, fallback = "The call could not be started."): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Allow microphone and camera access to place or answer this call.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "A microphone or camera required for this call was not found.";
    }
    if (error.name === "NotReadableError") {
      return "Your microphone or camera is already in use by another app.";
    }
  }
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: { error?: unknown } }).data;
    if (typeof data?.error === "string") return data.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
