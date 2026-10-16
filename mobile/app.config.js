// EAS / physical Android build only: Firebase client configuration is supplied
// via the configured build environment. No service-account key belongs here.
module.exports = ({config}) => {
 const path=process.env.COMPANION_GOOGLE_SERVICES_FILE;
 return {
   ...config,
   android:{
     ...config.android,
     ...(path?{googleServicesFile:path}:{})
   }
 };
};
