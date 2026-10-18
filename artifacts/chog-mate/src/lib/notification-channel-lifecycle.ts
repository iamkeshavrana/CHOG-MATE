import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationChannelClient = Pick<
  SupabaseClient,
  "channel" | "removeChannel" | "realtime"
>;
type NotificationChannel = ReturnType<NotificationChannelClient["channel"]>;

type NotificationChannelLifecycleCallbacks = {
  onUserChange: (userId: string | null) => void;
  onChange: (userId: string, payload: unknown) => void;
  onSubscribed: (userId: string) => void;
  onError: (error: unknown) => void;
};

const pendingChannelRemovals = new Map<string, Promise<void>>();

function topicForUser(userId: string): string {
  return `user-notifications:${userId}`;
}

function realtimeTopicForUser(userId: string): string {
  return `realtime:${topicForUser(userId)}`;
}

function removeChannelAndWait(
  client: NotificationChannelClient,
  channel: NotificationChannel,
): Promise<void> {
  const topic = channel.topic;
  const existingRemoval = pendingChannelRemovals.get(topic);
  if (existingRemoval) return existingRemoval;

  let removal: Promise<void>;
  removal = client.removeChannel(channel).then((status) => {
    if (status !== "ok" && client.realtime.getChannels().includes(channel)) {
      throw new Error(
        `Could not remove Supabase Realtime channel ${topic} (${status}).`,
      );
    }
  }).finally(() => {
    if (pendingChannelRemovals.get(topic) === removal) {
      pendingChannelRemovals.delete(topic);
    }
  });
  pendingChannelRemovals.set(topic, removal);
  return removal;
}

async function waitForChannelRemoval(topic: string): Promise<void> {
  const pendingRemoval = pendingChannelRemovals.get(topic);
  if (pendingRemoval) await pendingRemoval;
}

export function createNotificationChannelLifecycle(
  client: NotificationChannelClient,
  callbacks: NotificationChannelLifecycleCallbacks,
) {
  let activeUserId: string | null = null;
  let channel: NotificationChannel | null = null;
  let disposed = false;
  let changeVersion = 0;
  let transitionQueue: Promise<void> = Promise.resolve();
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const isCurrentUser = (userId: string, version: number) =>
    !disposed && activeUserId === userId && changeVersion === version;

  const scheduleRetry = (userId: string) => {
    if (disposed || activeUserId !== userId || retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void changeUser(userId);
    }, 3000);
  };

  const subscribe = async (userId: string, version: number): Promise<void> => {
    if (!isCurrentUser(userId, version) || channel) return;

    const topic = topicForUser(userId);
    const realtimeTopic = realtimeTopicForUser(userId);
    try {
      await waitForChannelRemoval(realtimeTopic);
    } catch (error) {
      callbacks.onError(error);
      scheduleRetry(userId);
      return;
    }
    if (!isCurrentUser(userId, version) || channel) return;

    const staleChannel = client.realtime
      .getChannels()
      .find((candidate) => candidate.topic === realtimeTopic);
    if (staleChannel) {
      try {
        await removeChannelAndWait(client, staleChannel);
      } catch (error) {
        callbacks.onError(error);
        scheduleRetry(userId);
        return;
      }
      if (!isCurrentUser(userId, version) || channel) return;
    }

    const candidate = client.channel(topic);
    if (candidate.joinedOnce || candidate.state !== "closed") {
      try {
        await removeChannelAndWait(client, candidate);
      } catch (error) {
        callbacks.onError(error);
      }
      scheduleRetry(userId);
      return;
    }

    const configuredChannel = candidate.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (
          disposed ||
          activeUserId !== userId ||
          channel !== configuredChannel
        ) {
          return;
        }
        callbacks.onChange(userId, payload);
      },
    );

    // Store the channel before subscribing so duplicate auth events cannot
    // retrieve this topic and try to attach listeners after it has joined.
    channel = configuredChannel;
    configuredChannel.subscribe((status) => {
      if (
        disposed ||
        activeUserId !== userId ||
        channel !== configuredChannel
      ) {
        return;
      }

      if (status === "SUBSCRIBED") {
        clearRetry();
        callbacks.onSubscribed(userId);
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        channel = null;
        void removeChannelAndWait(client, configuredChannel)
          .then(() => scheduleRetry(userId))
          .catch((error) => {
            callbacks.onError(error);
            scheduleRetry(userId);
          });
      }
    });
  };

  function changeUser(nextUserId: string | null): Promise<void> {
    const version = ++changeVersion;
    transitionQueue = transitionQueue
      .then(async () => {
        if (disposed || version !== changeVersion) return;

        if (nextUserId === activeUserId) {
          if (nextUserId) await subscribe(nextUserId, version);
          return;
        }

        const previousUserId = activeUserId;
        const previousChannel = channel;
        channel = null;
        activeUserId = nextUserId;
        clearRetry();
        callbacks.onUserChange(nextUserId);

        try {
          if (previousChannel) {
            await removeChannelAndWait(client, previousChannel);
          } else if (previousUserId) {
            await waitForChannelRemoval(realtimeTopicForUser(previousUserId));
          }
        } catch (error) {
          callbacks.onError(error);
          if (nextUserId) scheduleRetry(nextUserId);
          return;
        }

        if (
          disposed ||
          version !== changeVersion ||
          activeUserId !== nextUserId
        ) {
          return;
        }
        if (nextUserId) await subscribe(nextUserId, version);
      })
      .catch((error: unknown) => {
        callbacks.onError(error);
      });
    return transitionQueue;
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    changeVersion += 1;
    clearRetry();

    const previousUserId = activeUserId;
    const previousChannel = channel;
    activeUserId = null;
    channel = null;
    callbacks.onUserChange(null);

    if (previousChannel) {
      await removeChannelAndWait(client, previousChannel);
    } else if (previousUserId) {
      await waitForChannelRemoval(realtimeTopicForUser(previousUserId));
    }
  }

  return { changeUser, dispose };
}
