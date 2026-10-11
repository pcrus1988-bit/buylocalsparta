/** Canonical, indexable HUB CLAIM paths contain only permanent business slugs. */
export function hubClaimPublicPath(profile: { hubSlug: string; slug: string }): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.hubSlug) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.slug)) {
    throw new Error("Invalid public HUB CLAIM slug");
  }
  return "/hubs/" + profile.hubSlug + "/business/" + profile.slug;
}
