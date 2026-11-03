# Redux Toolkit status

Redux Toolkit is not installed or wired into this application.

The current web app shares only the authenticated session across routes; that
state is managed by React Context. Adding Redux Toolkit for the same session
would duplicate state and create synchronization risk.

Re-evaluate Redux Toolkit when substantial shared client state is introduced,
such as multi-page live telemetry, normalized asset graphs, offline queues, or
complex cross-dashboard workflows. If adopted, add `@reduxjs/toolkit` and
`react-redux` together and regenerate the root lockfile with `npm install`.
Do not hand-edit package-lock.json.
