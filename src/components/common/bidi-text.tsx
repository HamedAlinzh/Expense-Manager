import { Fragment } from "react";

// A run of digits possibly joined by masks, separators or date/time punctuation: "6219****401234", "1,250,000", "1405/04/12", "17:20".
const NUMERIC_RUN = /([0-9۰-۹٠-٩](?:[0-9۰-۹٠-٩*\/:.,٫٬،-]*[0-9۰-۹٠-٩*])?)/g;

/**
 * Renders mixed Persian/number text (bank SMS) so numeric runs keep their left-to-right order.
 * Without isolation the bidi algorithm reverses masked card numbers inside RTL lines
 * ("6219****401234" would display as "401234****6219").
 */
export function BidiText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {line.split(NUMERIC_RUN).map((part, j) =>
            j % 2 === 1 ? (
              <bdi key={j} dir="ltr">
                {part}
              </bdi>
            ) : (
              part
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * A stored bank message, laid out right-to-left when it contains Persian. The direction is set
 * explicitly: with dir="auto" Chrome gives each line its own direction, so a date-only line would
 * jump to the left edge.
 */
export function RawMessage({ body, className }: { body: string; className?: string }) {
  return (
    <pre
      dir={/[؀-ۿ]/.test(body) ? "rtl" : "ltr"}
      lang="fa"
      className={`font-persian text-start leading-7 whitespace-pre-wrap ${className ?? ""}`}
    >
      <BidiText text={body} />
    </pre>
  );
}
