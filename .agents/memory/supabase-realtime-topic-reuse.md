---
name: Supabase Realtime topic reuse
description: Channel creation and teardown rules for user-scoped Realtime subscriptions.
---

**Rule:** Supabase Realtime `channel(topic)` returns an existing channel when that topic is already registered. Attach all `postgres_changes` handlers before subscribing, keep the channel reference, and await removal before creating another channel with the same topic.

**Why:** Repeated auth events and React effect remounts can otherwise call `.on()` on an already-subscribed channel, raising a runtime error; asynchronous cleanup can also race a replacement.

**How to apply:** Serialize user/session transitions, remove the old channel by its object and await cleanup before creating the replacement, coordinate pending removals across effect remounts, and ignore callbacks whose user or channel is no longer active.
