// Dynamic wrapper over app.json (Expo merges app.json into `config` first).
//
// Sole purpose: wire google-services.json (Android FCM config) into the build
// without committing it to the public repo. Locally the gitignored file sits at
// ./google-services.json; on EAS workers the GOOGLE_SERVICES_JSON file env var
// materializes it and holds its path. Everything else stays in app.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
});
