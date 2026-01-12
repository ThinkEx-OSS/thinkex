"use client";

import { useMemo, useState } from "react";
import * as HeroIcons from "@heroicons/react/20/solid";
import React from "react";

export type IconInfo = {
  // the name of the component
  name: string;
  // a more human-friendly name
  friendly_name: string;
  Component: React.FC<React.ComponentPropsWithoutRef<"svg">>;
};

export const useIconPicker = (): {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  icons: IconInfo[];
} => {
  const icons: IconInfo[] = useMemo(
    () =>
      Object.entries(HeroIcons).map(([iconName, IconComponent]) => ({
        name: iconName,
        // split the icon name at capital letters and join them with a space
        friendly_name: iconName.match(/[A-Z][a-z]+/g)?.join(" ") ?? iconName,
        Component: IconComponent,
      })),
    []
  );

  // these lines can be removed entirely if you're not using the controlled component approach
  const [search, setSearch] = useState("");
  //   memoize the search functionality
  const filteredIcons = useMemo(() => {
    return icons.filter((icon) => {
      if (search === "") {
        return true;
      } else if (icon.name.toLowerCase().includes(search.toLowerCase())) {
        return true;
      } else {
        return icon.friendly_name.toLowerCase().includes(search.toLowerCase());
      }
    });
  }, [icons, search]);

  return { search, setSearch, icons: filteredIcons };
};

export const IconRenderer = ({
  icon,
  ...rest
}: {
  icon: string | null | undefined;
} & React.ComponentPropsWithoutRef<"svg">) => {
  if (!icon) {
    // Default icon when none is selected
    const FolderIcon = HeroIcons.FolderIcon;
    return <FolderIcon data-slot="icon" {...rest} />;
  }

  const IconComponent = HeroIcons[icon as keyof typeof HeroIcons];

  if (!IconComponent) {
    // Fallback to default icon if icon name is invalid
    const FolderIcon = HeroIcons.FolderIcon;
    return <FolderIcon data-slot="icon" {...rest} />;
  }

  return <IconComponent data-slot="icon" {...rest} />;
};

