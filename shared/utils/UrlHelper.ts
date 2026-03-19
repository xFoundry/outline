import { brand } from "./brand";

export class UrlHelper {
  public static home = brand.site;
  public static github = brand.github;
  public static twitter = brand.twitter;
  public static linkedin = brand.linkedin;
  public static contact = brand.contact;
  public static developers = brand.developers;
  public static changelog = brand.changelog;
  public static guide = brand.docs;

  public static SLUG_URL_REGEX = /^(?:[0-9a-zA-Z-_~]*-)?([a-zA-Z0-9]{10,15})$/;
  public static SHARE_URL_SLUG_REGEX = /^[0-9a-z-]+$/;
}
