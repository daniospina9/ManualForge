import type { BlockCatalog } from "../definition.ts";
import { prose } from "./prose.ts";
import { iconTable } from "./icon-table.ts";
import { dataTable } from "./data-table.ts";
import { figure } from "./figure.ts";
import { callout } from "./callout.ts";
import { detailHeader } from "./detail-header.ts";
import { fieldList } from "./field-list.ts";
import { procedure } from "./procedure.ts";
import { termList } from "./term-list.ts";
import { changeLog } from "./change-log.ts";

export * from "./prose.ts";
export * from "./icon-table.ts";
export * from "./data-table.ts";
export * from "./figure.ts";
export * from "./callout.ts";
export * from "./detail-header.ts";
export * from "./field-list.ts";
export * from "./procedure.ts";
export * from "./term-list.ts";
export * from "./change-log.ts";

/** The catalogue every manual is written against — see README.md. */
export const catalog: BlockCatalog = new Map(
  [
    prose,
    detailHeader,
    callout,
    figure,
    fieldList,
    termList,
    procedure,
    iconTable,
    dataTable,
    changeLog,
  ].map((b) => [b.type, b as never]),
);
