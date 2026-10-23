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
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
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
  const [mediaReady, setMediaReady] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
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
    setMediaReady(false);
    setConnectionState("new");
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
    let createdCall: CallSession | null = null;
    try {
      createdCall = await createCall({ matchId, type });
      const next = { call: createdCall, profile, role: "caller" as const };
      activeCallRef.current = next;
      setActiveCall(next);
      signalCursorRef.current = 0;
      setConnectionState("new");
      await queryClient
        .invalidateQueries({ queryKey: getGetIncomingCallsQueryKey() })
        .catch(() => undefined);

      stream = await navigator.mediaDevices.getUserMedia(
        type === "video"
          ? { audio: true, video: { facingMode: "user" } }
          : { audio: true, video: false },
      );
      if (activeCallRef.current?.call.id !== createdCall.id) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaReady(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (localStreamRef.current === stream) {
        localStreamRef.current = null;
        setLocalStream(null);
      }
      const wasCancelled = Boolean(createdCall && activeCallRef.current?.call.id !== createdCall.id);
      if (createdCall && !wasCancelled) {
        try {
          await callAction(createdCall.id, { action: "failed" });
        } catch {
          // The call may already have ended.
        }
        clearActiveCall(createdCall.id);
      }
      if (!wasCancelled) showNotice(callErrorMessage(error));
    } finally {
      setBusyState(false);
    }
  }, [clearActiveCall, hasIncomingCall, queryClient, setBusyState, showNotice]);

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
      setMediaReady(true);
      const next = { call, profile: incoming.profile, role: "receiver" as const };
      activeCallRef.current = next;
      setActiveCall(next);
      signalCursorRef.current = 0;
      setConnectionState("new");
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
    if (!call) return;
    const anotherActionIsPending = busyRef.current;
    setBusyState(true);
    try {
      await callAction(call.id, { action: "end" });
    } catch {
      // Always release the local devices even if the server is unavailable.
    } finally {
      clearActiveCall(call.id);
      if (!anotherActionIsPending) setBusyState(false);
    }
  }, [clearActiveCall, setBusyState]);

  useEffect(() => {
    const current = activeCall;
    if (!current || !mediaReady) return;

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
      setConnectionState(peer.connectionState);
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
    peer.oniceconnectionstatechange = () => {
      if (cancelled) return;
      if (peer.iceConnectionState === "failed") {
        void markCallFailed(current.call.id, "The call could not connect. Check your network and try again.");
      } else if (peer.iceConnectionState === "disconnected" && disconnectedTimeout === null) {
        disconnectedTimeout = window.setTimeout(() => {
          if (peer.iceConnectionState === "disconnected") {
            void markCallFailed(current.call.id, "The call connection was lost.");
          }
        }, 15_000);
      } else if (
        peer.iceConnectionState === "connected" ||
        peer.iceConnectionState === "completed"
      ) {
        if (disconnectedTimeout !== null) {
          window.clearTimeout(disconnectedTimeout);
          disconnectedTimeout = null;
        }
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
  }, [activeCall?.call.id, activeCall?.role, clearActiveCall, markCallFailed, mediaReady, showNotice, updateActiveCall]);

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

  const switchCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const currentTrack = stream?.getVideoTracks()[0];
    if (!stream || !currentTrack) return;

    let replacement: MediaStreamTrack | undefined;
    try {
      const cameras = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "videoinput");
      if (cameras.length < 2) {
        showNotice("Only one camera is available on this device.");
        return;
      }
      const currentDeviceId = currentTrack.getSettings().deviceId;
      const currentIndex = cameras.findIndex((device) => device.deviceId === currentDeviceId);
      const nextCamera = cameras[(currentIndex + 1 + cameras.length) % cameras.length];
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: nextCamera.deviceId } },
      });
      replacement = cameraStream.getVideoTracks()[0];
      if (!replacement) throw new Error("The selected camera is unavailable.");

      const sender = peerRef.current?.getSenders()
        .find((item) => item.track?.kind === "video");
      await sender?.replaceTrack(replacement);
      const nextStream = new MediaStream([
        ...stream.getAudioTracks(),
        replacement,
      ]);
      currentTrack.stop();
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setCameraEnabled(true);
    } catch (error) {
      replacement?.stop();
      showNotice(callErrorMessage(error, "The camera could not be switched."));
    }
  }, [showNotice]);

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
        connectionState={connectionState}
        muted={muted}
        cameraEnabled={cameraEnabled}
        busy={busy}
        notice={notice}
        onAccept={(call) => void acceptCall(call)}
        onDecline={(call) => void declineCall(call)}
        onEnd={() => void endCall()}
        onToggleMicrophone={toggleMicrophone}
        onToggleCamera={toggleCamera}
        onSwitchCamera={() => void switchCamera()}
      />
    </CallContext.Provider>
  );
}

function CallOverlay({
  activeCall,
  incoming,
  localStream,
  remoteStream,
  connectionState,
  muted,
  cameraEnabled,
  busy,
  notice,
  onAccept,
  onDecline,
  onEnd,
  onToggleMicrophone,
  onToggleCamera,
  onSwitchCamera,
}: {
  activeCall: ActiveCall | null;
  incoming: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  muted: boolean;
  cameraEnabled: boolean;
  busy: boolean;
  notice: string;
  onAccept: (call: IncomingCall) => void;
  onDecline: (call: IncomingCall) => void;
  onEnd: () => void;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const ringtoneRef = useRef<{
    context: AudioContext;
    oscillator: OscillatorNode;
    gain: GainNode;
    intervalId: number;
  } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [ringSoundNeedsGesture, setRingSoundNeedsGesture] = useState(false);

  const stopRingtone = () => {
    const ringtone = ringtoneRef.current;
    if (!ringtone) return;
    window.clearInterval(ringtone.intervalId);
    ringtone.gain.gain.cancelScheduledValues(ringtone.context.currentTime);
    ringtone.gain.gain.setTargetAtTime(0, ringtone.context.currentTime, 0.02);
    try {
      ringtone.oscillator.stop();
    } catch {
      // The oscillator may already have stopped.
    }
    void ringtone.context.close();
    ringtoneRef.current = null;
  };

  const startRingtone = async () => {
    let ringtone = ringtoneRef.current;
    if (!ringtone) {
      if (typeof AudioContext === "undefined") {
        setRingSoundNeedsGesture(true);
        return;
      }
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();

      const playPattern = () => {
        if (context.state !== "running") return;
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
        gain.gain.setValueAtTime(0.1, now + 0.22);
        gain.gain.linearRampToValueAtTime(0, now + 0.26);
        gain.gain.setValueAtTime(0.1, now + 0.38);
        gain.gain.setValueAtTime(0.1, now + 0.6);
        gain.gain.linearRampToValueAtTime(0, now + 0.64);
      };
      ringtone = {
        context,
        oscillator,
        gain,
        intervalId: window.setInterval(playPattern, 1_900),
      };
      ringtoneRef.current = ringtone;
    }
    try {
      await ringtone.context.resume();
      if (ringtone.context.state === "running") {
        setRingSoundNeedsGesture(false);
        const now = ringtone.context.currentTime;
        ringtone.gain.gain.cancelScheduledValues(now);
        ringtone.gain.gain.setValueAtTime(0, now);
        ringtone.gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
        ringtone.gain.gain.setValueAtTime(0.1, now + 0.22);
        ringtone.gain.gain.linearRampToValueAtTime(0, now + 0.26);
        ringtone.gain.gain.setValueAtTime(0.1, now + 0.38);
        ringtone.gain.gain.setValueAtTime(0.1, now + 0.6);
        ringtone.gain.gain.linearRampToValueAtTime(0, now + 0.64);
      } else {
        setRingSoundNeedsGesture(true);
      }
    } catch {
      setRingSoundNeedsGesture(true);
    }
  };

  useEffect(() => {
    if (!incoming || activeCall) {
      stopRingtone();
      setRingSoundNeedsGesture(false);
      return;
    }
    void startRingtone();
    return stopRingtone;
  }, [incoming?.id, activeCall?.call.id]);

  useEffect(() => {
    connectedAtRef.current = null;
    setCallDuration(0);
    setSpeakerEnabled(true);
  }, [activeCall?.call.id]);

  useEffect(() => {
    if (!activeCall || connectionState !== "connected") return;
    connectedAtRef.current ??= Date.now();
    const updateDuration = () => {
      if (connectedAtRef.current !== null) {
        setCallDuration(Math.floor((Date.now() - connectedAtRef.current) / 1_000));
      }
    };
    updateDuration();
    const intervalId = window.setInterval(updateDuration, 1_000);
    return () => window.clearInterval(intervalId);
  }, [activeCall?.call.id, connectionState]);

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
    audio.muted = !speakerEnabled;
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
  }, [remoteStream, activeCall?.call.id, speakerEnabled]);

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
      <div className="fixed inset-0 z-[100] grid place-items-center bg-[#24133ff0] p-0 sm:p-6" role="presentation">
        <section
          className="surface relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden rounded-none px-6 py-10 text-center shadow-2xl sm:min-h-0 sm:max-w-md sm:rounded-[32px] sm:px-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incoming-call-title"
          aria-describedby="incoming-call-description"
          data-testid="dialog-incoming-call"
        >
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,#f4d9f4_0%,#f2e8ff_48%,transparent_82%)]" aria-hidden="true"/>
          <div className="relative mx-auto">
            <div className="absolute -inset-4 animate-ping rounded-full border border-[#a28ad2]/60" aria-hidden="true"/>
            <ProfileAvatar profile={incoming.profile} size="lg"/>
          </div>
          <p className="relative mt-7 text-xs font-bold uppercase tracking-[.18em] text-[#8a76a0]" aria-live="polite">
            Incoming {incoming.type} call
          </p>
          <h2 id="incoming-call-title" className="display mt-2 text-3xl font-extrabold text-[#24133f]">
            {incoming.profile.displayName}
          </h2>
          <p id="incoming-call-description" className="mt-2 text-sm font-medium text-[#756887]">
            @{incoming.profile.username} · Chog #{incoming.profile.chog.tokenId}
          </p>
          {ringSoundNeedsGesture && (
            <button
              type="button"
              onClick={() => void startRingtone()}
              className="mt-5 rounded-full bg-[#f2ecff] px-4 py-2 text-xs font-bold text-[#6246b0]"
              data-testid="button-enable-ring-sound"
            >
              Tap to enable ringing sound
            </button>
          )}
          <div className="mt-10 flex w-full justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                stopRingtone();
                onDecline(incoming);
              }}
              disabled={busy}
              className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[#f3e8e9] px-5 text-sm font-bold text-[#914c58] transition hover:bg-[#f0dcdf] disabled:opacity-50"
              data-testid="button-decline-call"
            >
              <PhoneOff size={17}/>Decline
            </button>
            <button
              type="button"
              onClick={() => {
                stopRingtone();
                onAccept(incoming);
              }}
              disabled={busy}
              className="button-primary inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold shadow-lg shadow-[#7047ff]/20 disabled:opacity-50"
              data-testid="button-accept-call"
            >
              {incoming.type === "video" ? <Video size={17}/> : <Phone size={17}/>}
              {busy ? "Connecting…" : "Accept"}
            </button>
          </div>
        </section>
      </div>
    )}

    {activeCall && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#24133ff2] p-0 sm:p-5">
        <section
          className="surface flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-[#fffaf6] shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-4xl sm:rounded-[32px]"
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
                <p className="text-xs text-[#887c90]" aria-live="polite">
                  {callStatusLabel(activeCall, connectionState, callDuration)}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-[#f2ecff] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6246b0]">
              {activeCall.call.type} call
            </span>
          </header>
          {activeCall.call.type === "video" ? (
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#38253a] sm:flex-none sm:aspect-video">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full max-h-full w-full object-contain sm:object-cover"
                aria-label="Video from the other caller"
              />
              {!remoteStream && (
                <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_top,#7047ff66_0%,transparent_62%)] px-8 text-center text-sm font-semibold text-white/85">
                  {connectionState === "connected" ? "Waiting for video…" : "Connecting your call…"}
                </div>
              )}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 aspect-video w-[30%] max-w-52 rounded-2xl border border-white/45 bg-[#24133f] object-cover shadow-xl sm:bottom-5 sm:right-5 sm:w-1/4"
                aria-label="Your camera preview"
              />
              {!cameraEnabled && <span className="absolute bottom-4 left-4 rounded-full bg-[#24133fcc] px-3 py-1.5 text-xs font-semibold text-white">Camera off</span>}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#f7f2ff_0,transparent_68%)] p-8 sm:min-h-72">
              <div className="relative">
                {connectionState === "connected" && <div className="absolute -inset-4 animate-pulse rounded-full bg-[#bd8cea]/20" aria-hidden="true"/>}
                <ProfileAvatar profile={activeCall.profile} size="lg"/>
              </div>
              <p className="mt-5 text-sm font-medium text-[#82778c]">
                {connectionState === "connected" ? "You’re connected" : activeCall.role === "caller" ? "Calling…" : "Connecting…"}
              </p>
            </div>
          )}
          <audio ref={remoteAudioRef} autoPlay className="sr-only" aria-label="Audio from the other caller"/>
          <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-[#24133f12] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-5">
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
              className={`grid h-12 w-12 place-items-center rounded-full transition ${muted ? "bg-[#f3e8e9] text-[#914c58]" : "bg-[#eee7fb] text-[#6246b0] hover:bg-[#e5d8fa]"}`}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
              data-testid="button-toggle-microphone"
            >
              {muted ? <MicOff size={19}/> : <Mic size={19}/>}
            </button>
            <button
              type="button"
              onClick={() => setSpeakerEnabled((enabled) => !enabled)}
              className={`grid h-12 w-12 place-items-center rounded-full transition ${speakerEnabled ? "bg-[#eee7fb] text-[#6246b0] hover:bg-[#e5d8fa]" : "bg-[#f3e8e9] text-[#914c58]"}`}
              aria-label={speakerEnabled ? "Mute call audio" : "Enable call audio"}
              aria-pressed={!speakerEnabled}
              data-testid="button-toggle-speaker"
            >
              {speakerEnabled ? <Volume2 size={19}/> : <VolumeX size={19}/>}
            </button>
            {activeCall.call.type === "video" && (
              <>
                <button
                  type="button"
                  onClick={onToggleCamera}
                  className={`grid h-12 w-12 place-items-center rounded-full transition ${cameraEnabled ? "bg-[#eee7fb] text-[#6246b0] hover:bg-[#e5d8fa]" : "bg-[#f3e8e9] text-[#914c58]"}`}
                  aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
                  aria-pressed={!cameraEnabled}
                  data-testid="button-toggle-camera"
                >
                  {cameraEnabled ? <Camera size={19}/> : <CameraOff size={19}/>}
                </button>
                <button
                  type="button"
                  onClick={onSwitchCamera}
                  className="grid h-12 w-12 place-items-center rounded-full bg-[#eee7fb] text-[#6246b0] transition hover:bg-[#e5d8fa]"
                  aria-label="Switch camera"
                  data-testid="button-switch-camera"
                >
                  <SwitchCamera size={19}/>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onEnd}
              className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded-full bg-[#bb3d58] px-5 text-sm font-bold text-white transition hover:bg-[#a52f49]"
              data-testid={activeCall.role === "caller" && connectionState !== "connected" ? "button-cancel-call" : "button-end-call"}
            >
              <PhoneOff size={17}/>{activeCall.role === "caller" && connectionState !== "connected" ? "Cancel call" : "End call"}
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

function callStatusLabel(
  activeCall: ActiveCall,
  connectionState: RTCPeerConnectionState,
  callDuration: number,
): string {
  if (connectionState === "connected") {
    return `Connected · ${formatCallDuration(callDuration)}`;
  }
  if (connectionState === "failed") return "Call failed";
  if (activeCall.call.status === "calling") {
    return activeCall.role === "caller" ? "Calling…" : "Incoming call";
  }
  if (activeCall.call.status === "connecting") return "Connecting…";
  return activeCall.call.status;
}

function formatCallDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
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
