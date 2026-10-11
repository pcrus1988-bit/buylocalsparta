import type {NextConfig} from "next";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const serviceDir=dirname(fileURLToPath(import.meta.url));
const repoRoot=resolve(serviceDir,"../..");
if(process.env.FISCAL_STANDALONE_MODE!=="true")
  throw new Error("The independent Fiscal service requires FISCAL_STANDALONE_MODE=true");
const config:NextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  outputFileTracingRoot:repoRoot,
  serverExternalPackages:["pg"],
  transpilePackages:[
    "@buy-local-sparta/core","@buy-local-sparta/postgres-runtime",
    "@buy-local-sparta/aade-mydata","@buy-local-sparta/resend-notifications"
  ],
  async headers(){
    return [
      {source:"/:path*",headers:[
        {key:"X-Content-Type-Options",value:"nosniff"},
        {key:"X-Frame-Options",value:"DENY"},
        {key:"Referrer-Policy",value:"no-referrer"},
        {key:"Cache-Control",value:"private, no-store"},
        {key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},
        {key:"Content-Security-Policy",value:[
          "default-src 'self'","script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'","img-src 'self' data: https:",
          "font-src 'self' data:","connect-src 'self'","frame-ancestors 'none'",
          "base-uri 'self'","form-action 'self'","object-src 'none'"
        ].join("; ")}
      ]}
    ];
  }
};
export default config;
