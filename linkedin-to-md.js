// ==UserScript==
// @name         LinkedIn Job → Markdown
// @namespace    linkedin-job-to-md
// @version      0.1.0
// @description  Copy LinkedIn job details (right pane) as clean Markdown
// @match        https://www.linkedin.com/jobs/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    "use strict";

    /******************************************************************
     * Utilities
     ******************************************************************/
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const clean = (s) =>
        s
            ?.replace(/\s+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/\s{2,}/g, " ")
            .trim() || "";

    const text = (el) => clean(el?.innerText || "");

    /******************************************************************
     * DOM Extraction
     ******************************************************************/
    function findJobRoot() {
        return (
            document.querySelector(".jobs-search__job-details") ||
            document.querySelector("main") ||
            document.querySelector('[role="main"]') ||
            document.body
        );
    }

    function htmlToMarkdown(root) {
        let md = "";

        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                md += node.textContent;
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toLowerCase();

            switch (tag) {
                case "h2":
                    md += `\n\n## ${node.innerText.trim()}\n\n`;
                    return;

                case "p":
                    md += "\n\n";
                    node.childNodes.forEach(walk);
                    md += "\n\n";
                    return;

                case "strong":
                    md += "**";
                    node.childNodes.forEach(walk);
                    md += "**";
                    return;

                case "ul":
                    md += "\n";
                    node.querySelectorAll(":scope > li").forEach((li) => {
                        md += "- ";
                        li.childNodes.forEach(walk);
                        md += "\n";
                    });
                    md += "\n";
                    return;

                case "li":
                    node.childNodes.forEach(walk);
                    return;

                case "br":
                    md += "\n\n";
                    return;

                default:
                    node.childNodes.forEach(walk);
            }
        }

        walk(root);

        return md
            .trim();
    }

    function companyToMarkdown(company) {
        if (!company) return "";

        return `
## ${company.heading}

**${company.name}**
${company.meta}

${company.description.replace("show more", "").replace("…", "")}
`.trim();
    }

    function extractCompany() {
        const box = document.querySelector(".jobs-company__box");
        if (!box) return null;

        const heading =
            box.querySelector("h2")?.innerText.trim() || "About the company";

        const name =
            box.querySelector('a[href*="/company/"]')?.innerText.trim() || "";

        const meta =
            box.querySelector(".t-14.mt5")?.innerText
                .replace(/\s{2,}/g, " ")
                .trim() || "";

        const descRoot =
            box.querySelector(".jobs-company__company-description div");

        const description = descRoot
            ? htmlToMarkdown(descRoot)
            : "";

        return {
            heading,
            name,
            meta,
            description,
        };
    }


    function extractJob() {
        const root = findJobRoot();
        if (!root) return null;

        // Title
        const title =
            text(root.querySelector("h2")) ||
            text(root.querySelector("h1"));

        // Company
        const company = text(root.querySelector(".job-details-jobs-unified-top-card__company-name a"))

        // Job Meta
        const metaBlocks = [...document.querySelector(".jobs-search__job-details").querySelectorAll(".tvm__text.tvm__text--low-emphasis")].map(x => x.innerText).filter(x => x.includes(" · ") != true)

        const meta = clean(metaBlocks.join(" • "));

        // Job Description
        const descriptionEl =
            root.querySelector('div[class*="jobs-description__content"]') ||
            root.querySelector('div[id*="job-details"]') ||
            root.querySelector("article");

        const jobDetailsRoot = document.querySelector("#job-details");
        const description = jobDetailsRoot ? htmlToMarkdown(jobDetailsRoot) : "_No description found._";


        // Job URL
        const url = location.href.split("?")[0];

        return {
            title,
            company,
            meta,
            description,
            url,
        };
    }

    /******************************************************************
     * Markdown Conversion
     ******************************************************************/
    function toMarkdown(job) {
        if (!job || !job.title) {
            return "_Unable to extract job details._";
        }

        const companySection = extractCompany();

        return clean(`
# ${job.title}

**Company:** ${job.company || "—"}
**Details:** ${job.meta || "—"}
**Source:** ${job.url}
\n\n
---
\n\n
## Job Description

${job.description || "_No description found._"}
\n\n
---
\n\n
${companySection ? companyToMarkdown(companySection) : ""}
`);
    }

    /******************************************************************
     * Clipboard Action
     ******************************************************************/
    async function copyJobAsMarkdown() {
        // LinkedIn SPA sometimes needs a tick
        await sleep(150);

        const job = extractJob();
        const md = toMarkdown(job);

        GM_setClipboard(md, { type: "text", mimetype: "text/plain" });

        console.log("[LinkedIn → Markdown] Copied:\n", md);
        flash("Job copied as Markdown");
    }

    /******************************************************************
     * UX Feedback (Minimal)
     ******************************************************************/
    function flash(msg) {
        const el = document.createElement("div");
        el.textContent = msg;
        Object.assign(el.style, {
            position: "fixed",
            bottom: "24px",
            right: "24px",
            padding: "8px 12px",
            background: "#0a66c2",
            color: "#fff",
            fontSize: "12px",
            borderRadius: "4px",
            zIndex: 9999,
        });

        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }

    /******************************************************************
     * Keyboard Shortcut
     ******************************************************************/
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === "KeyM") {
            e.preventDefault();
            copyJobAsMarkdown();
        }
    });

    /******************************************************************
     * SPA Safety: Observe DOM Changes
     ******************************************************************/
    const observer = new MutationObserver(() => {
        // no-op; ensures script stays alive across job switches
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    console.log("[LinkedIn → Markdown] Loaded");
})();
