import * as React from "react";
import styled from "styled-components";
import { depths, s } from "@shared/styles";
import env from "~/env";
import BrandIcon from "./Icons/BrandIcon";

type Props = {
  href?: string;
};

function Branding({ href = env.URL }: Props) {
  return (
    <Link href={href} target="_blank">
      <BrandIcon size={20} alt="" />
      &nbsp;{env.APP_NAME}
    </Link>
  );
}

const Link = styled.a`
  justify-content: center;
  padding-bottom: 16px;

  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  border-top-right-radius: 2px;
  color: ${s("text")};
  display: flex;
  align-items: center;

  img {
    display: block;
    flex-shrink: 0;
  }

  z-index: ${depths.sidebar + 1};
  background: ${s("sidebarBackground")};
  position: fixed;
  bottom: 0;
  right: 0;
  padding: 16px;

  &:hover {
    background: ${s("sidebarControlHoverBackground")};
  }
`;

export default React.memo(Branding);
