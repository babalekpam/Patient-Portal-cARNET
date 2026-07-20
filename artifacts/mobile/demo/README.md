# App Demo Video

`NaviMED-app-demo.mp4` — a 2 min 51 s screen recording of the real app (Expo web build)
walking through the full patient journey:

1. Sign-in screen with EHR provider selection (Navimedi)
2. Typing credentials and logging in
3. Home dashboard with all quick actions
4. Test Results (lab panels with flagged values)
5. Medications (active prescriptions with refills)
6. Messages (care-team inbox)
7. Visit Summaries (diagnosis, vitals, follow-up)
8. Bills & Payments (charges, insurance, patient responsibility)
9. Telehealth (upcoming video consultation)
10. Symptom Checker
11. Reminders and Profile tabs

## How it was made

The actual app is launched with `expo start --web` and driven by Playwright
(`record-demo.js`), which records the browser session as video. Because the
portal requires live EHR credentials, the Navimedi API calls are intercepted
and answered with realistic sample patient data (`mockdata.js`) — every screen
in the video is the real app rendering real API responses.

To re-record:

```bash
pnpm --filter @workspace/mobile exec expo start --web --port 8081 --offline &
node demo/record-demo.js   # requires playwright + chromium
# output: demo/video/<hash>.webm — convert with ffmpeg to mp4
```
