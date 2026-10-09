(() => {
  // src/push-presentation.js
  var COPY = Object.freeze({
    update: ["Family update", "Open GW to see what\u2019s new."],
    message: ["New message", "Open your conversation to read it."],
    invitation: ["Conversation invitation", "Open GW to accept or decline."],
    conversation: ["Conversation updated", "Open your conversation for details."],
    post: ["New family post", "Open GW to read the update."],
    memory: ["New shared memory", "Open GW to see the memory."],
    mention: ["You were tagged", "Open GW to see the update."],
    reply: ["New reply", "Open GW to read the reply."],
    reaction: ["New reaction", "Open GW to see the reaction."],
    announcement: ["Family announcement", "Open GW to read the announcement."],
    birthday: ["Birthday celebration", "Open GW to join the celebration."],
    household: ["Household update", "Open GW to review the household activity."],
    contribution: ["Contribution update", "Open GW to review the status."],
    order: ["Shirt update", "Open GW to review the status."],
    membership: ["Family account update", "Open GW to review the changes."],
    reunion: ["Reunion update", "Open GW to review the latest details."],
    test: ["Test notification", "GW can send notifications to this device."]
  });
  var validPushId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  function boundedPushText(value, limit) {
    if (typeof value !== "string") return "";
    const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, " ").replace(/\s+/gu, " ").trim();
    const points = Array.from(clean);
    return points.length <= limit ? clean : points.slice(0, limit - 1).join("") + "\u2026";
  }
  function pushCopy(activity = "update") {
    const [title, body] = COPY[activity] || COPY.update;
    return { title, body };
  }
  function pushPresentation(payload, now = Date.now()) {
    const fresh = payload?.v === 1 && Number.isSafeInteger(payload.expiresAt) && payload.expiresAt > now;
    const test = fresh && payload.test === true, id = fresh && !test && validPushId(payload.noticeId) ? payload.noticeId : null;
    const activity = test ? "test" : id && payload.presentationVersion === 2 && Object.hasOwn(COPY, payload.activity) && payload.activity !== "test" ? payload.activity : "update";
    const copy = pushCopy(activity), preview = payload?.presentationVersion === 2 && id && activity === "message" && payload.preview?.consent === true ? payload.preview : null;
    const sender = boundedPushText(preview?.sender, 80), text = boundedPushText(preview?.text, 160);
    return { ...copy, ...sender && text ? { title: sender, body: text } : {}, noticeId: id, reply: !!id && activity === "message", test, tag: test ? "gw-test" : id ? "gw-notice-" + id : "gw-activity" };
  }

  // src/service-worker.js
  self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
  self.addEventListener("activate", (event) => event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("gw-static-")).map((k) => caches.delete(k)));
    await self.clients.claim();
  })()));
  self.addEventListener("push", (event) => event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data?.json();
    } catch {
    }
    const presentation = pushPresentation(payload), { title, body, noticeId, reply, test, tag } = presentation;
    const options = { body, tag, renotify: false, icon: "/icon-192.png", data: { noticeId, reply, test } };
    if (reply && Number(self.Notification?.maxActions) > 0) options.actions = [{ action: "reply", title: "Reply in GW" }];
    try {
      await self.registration.showNotification(title, options);
    } catch (error) {
      if (!options.actions) throw error;
      delete options.actions;
      await self.registration.showNotification(title, options);
    }
  })()));
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil((async () => {
      const data = event.notification.data, id = data?.noticeId;
      const url = new URL(validPushId(id) ? "/?gwNotice=" + encodeURIComponent(id) + (data?.reply && event.action === "reply" ? "&gwReply=1" : "") : data?.test ? "/?gwPushTest=1" : "/", self.location.origin).href;
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = clients.find((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      if (client) {
        try {
          const navigated = await client.navigate(url);
          await (navigated || client).focus();
          return;
        } catch {
        }
      }
      await self.clients.openWindow(url);
    })());
  });
})();
