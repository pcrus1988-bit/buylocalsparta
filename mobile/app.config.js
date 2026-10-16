// Firebase Android client config is injected only through the build environment.
// Standalone PREVIEW builds get a different application ID so they can coexist
// with the user's previously installed debug-key signed Companion APK.
module.exports=({config})=>{
 const path=process.env.COMPANION_GOOGLE_SERVICES_FILE;
 const preview=process.env.COMPANION_PREVIEW_APK==="true";
 return {
  ...config,
  ...(preview?{
   name:"KONTA MOY Companion Preview",
   scheme:"kontamoucompanionpreview",
  }:{}),
  extra:{...config.extra,companionPreview:preview},
  android:{
   ...config.android,
   ...(preview?{
    package:"site.kontamou.companion.preview",
    versionCode:1,
   }:{}),
   ...(path&&!preview?{googleServicesFile:path}:{})
  }
 };
};
