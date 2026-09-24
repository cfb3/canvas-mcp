import { z } from "zod";
import { CanvasClient } from "../canvasClient.js";

export function registerModuleTools(server: any, canvas: CanvasClient) {
  // Tool: list-modules
  server.tool(
    "list-modules",
    "Return all modules in a course (optionally inline items).",
    {
      courseId: z.string().describe("The ID of the course"),
      includeItems: z.boolean().default(false).describe("Whether to include inline items for each module")
    },
    async ({ courseId, includeItems }: { courseId: string; includeItems?: boolean }) => {
      let modules: any[] = [];
      let page = 1;
      let hasMore = true;
      try {
        while (hasMore) {
          const params: any = {
            per_page: 100,
            page: page,
            ...(includeItems ? { 'include[]': 'items' } : {})
          };
          const pageModules = (await canvas.listModules(courseId, params) as any[]);
          modules.push(...pageModules);
          hasMore = pageModules.length === 100;
          page += 1;
        }
        const formatted = modules.map((mod: any) => {
          const lines = [
            `Module: ${mod.name}`,
            `ID: ${mod.id}`,
            `Position: ${mod.position}`,
            `Published: ${mod.published ? 'Yes' : 'No'}`
          ];
          if (includeItems && mod.items) {
            lines.push('Items:');
            mod.items.forEach((item: any) => {
              lines.push(`  - [${item.type}] ${item.title || item.page_url || item.url || 'Untitled'} (ID: ${item.id})`);
            });
          }
          lines.push('---');
          return lines.join('\n');
        }).join('\n');
        return {
          content: [
            {
              type: "text",
              text: modules.length > 0 ? `Modules in course ${courseId}:\n\n${formatted}` : "No modules found in this course."
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch modules: ${error.message}`);
        }
        throw new Error('Failed to fetch modules: Unknown error');
      }
    }
  );

  // Tool: list-module-items
  server.tool(
    "list-module-items",
    "Given a module ID, list its items (pages, quizzes, files, etc).",
    {
      courseId: z.string().describe("The ID of the course"),
      moduleId: z.string().describe("The ID of the module")
    },
    async ({ courseId, moduleId }: { courseId: string; moduleId: string }) => {
      let items: any[] = [];
      let page = 1;
      let hasMore = true;
      try {
        while (hasMore) {
          const params = { per_page: 100, page: page };
          const pageItems = (await canvas.listModuleItems(courseId, moduleId, params) as any[]);
          items.push(...pageItems);
          hasMore = pageItems.length === 100;
          page += 1;
        }
        const formatted = items.map((item: any) => {
          return [
            `Type: ${item.type}`,
            `Title: ${item.title || item.page_url || item.url || 'Untitled'}`,
            `ID: ${item.id}`,
            `Position: ${item.position}`,
            `Published: ${item.published ? 'Yes' : 'No'}`,
            '---'
          ].join('\n');
        }).join('\n');
        return {
          content: [
            {
              type: "text",
              text: items.length > 0 ? `Items in module ${moduleId} (course ${courseId}):\n\n${formatted}` : "No items found in this module."
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch module items: ${error.message}`);
        }
        throw new Error('Failed to fetch module items: Unknown error');
      }
    }
  );

  // Tool: toggle-module-publish
  server.tool(
    "toggle-module-publish",
    "Publish/unpublish a module (toggles the current published state).",
    {
      courseId: z.string().describe("The ID of the course"),
      moduleId: z.string().describe("The ID of the module")
    },
    async ({ courseId, moduleId }: { courseId: string; moduleId: string }) => {
      try {
        const current = (await canvas.getModule(courseId, moduleId) as any);
        const newPublished = !current.published;
        await canvas.updateModulePublish(courseId, moduleId, { published: newPublished });
        return {
          content: [
            {
              type: "text",
              text: `Module ${moduleId} in course ${courseId} is now ${newPublished ? 'published' : 'unpublished'}.`
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to toggle module publish: ${error.message}`);
        }
        throw new Error('Failed to toggle module publish: Unknown error');
      }
    }
  );

  // Tool: create-module
  server.tool(
    "create-module",
    "Create a module in a course. New modules start unpublished; publish with update-module.",
    {
      courseId: z.string().describe("The ID of the course"),
      name: z.string().describe("The module name"),
      position: z.number().optional().describe("1-based position in the module list")
    },
    async ({ courseId, name, position }: { courseId: string; name: string; position?: number }) => {
      try {
        const mod: any = await canvas.createModule(courseId, { name, ...(position !== undefined ? { position } : {}) });
        return {
          content: [{ type: "text", text: `Created module "${mod.name}" (ID: ${mod.id}, position ${mod.position}, ${mod.published ? 'published' : 'unpublished'}).` }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to create module: ${error.message}`);
        }
        throw new Error('Failed to create module: Unknown error');
      }
    }
  );

  // Tool: update-module
  server.tool(
    "update-module",
    "Rename, reorder, publish, or unpublish a module. Only the fields you pass change.",
    {
      courseId: z.string().describe("The ID of the course"),
      moduleId: z.string().describe("The ID of the module"),
      name: z.string().optional(),
      position: z.number().optional().describe("1-based position in the module list"),
      published: z.boolean().optional()
    },
    async (args: any) => {
      const { courseId, moduleId, ...fields } = args;
      try {
        const mod: any = await canvas.updateModule(courseId, moduleId, fields);
        return {
          content: [{ type: "text", text: `Module "${mod.name}" (ID: ${mod.id}): position ${mod.position}, ${mod.published ? 'published' : 'unpublished'}.` }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to update module: ${error.message}`);
        }
        throw new Error('Failed to update module: Unknown error');
      }
    }
  );

  // Tool: delete-module
  server.tool(
    "delete-module",
    "Delete a module. The pages, assignments, and files it links to are NOT deleted; only the module and its item links are.",
    {
      courseId: z.string().describe("The ID of the course"),
      moduleId: z.string().describe("The ID of the module")
    },
    async ({ courseId, moduleId }: { courseId: string; moduleId: string }) => {
      try {
        const mod: any = await canvas.deleteModule(courseId, moduleId);
        return {
          content: [{ type: "text", text: `Deleted module "${mod?.name ?? moduleId}" from course ${courseId}.` }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to delete module: ${error.message}`);
        }
        throw new Error('Failed to delete module: Unknown error');
      }
    }
  );

  // Tool: add-module-item
  server.tool(
    "add-module-item",
    "Add an item to a module. type Page needs pageUrl (the page slug); ExternalUrl needs externalUrl; Assignment, Quiz, File, and Discussion need contentId; SubHeader needs only title.",
    {
      courseId: z.string().describe("The ID of the course"),
      moduleId: z.string().describe("The ID of the module"),
      type: z.enum(["Page", "ExternalUrl", "Assignment", "Quiz", "File", "Discussion", "SubHeader"]),
      title: z.string().optional().describe("Display title (required for ExternalUrl and SubHeader)"),
      pageUrl: z.string().optional().describe("Page slug, for type Page"),
      externalUrl: z.string().optional().describe("URL, for type ExternalUrl"),
      contentId: z.string().optional().describe("Canvas id of the assignment, quiz, file, or discussion"),
      newTab: z.boolean().default(true).describe("Open an ExternalUrl in a new tab"),
      position: z.number().optional().describe("1-based position within the module"),
      indent: z.number().optional().describe("Indent level, 0 to 5")
    },
    async (args: any) => {
      const { courseId, moduleId, type, title, pageUrl, externalUrl, contentId, newTab, position, indent } = args;
      try {
        const item: any = { type };
        if (title !== undefined) item.title = title;
        if (pageUrl !== undefined) item.page_url = pageUrl;
        if (externalUrl !== undefined) item.external_url = externalUrl;
        if (contentId !== undefined) item.content_id = contentId;
        if (type === "ExternalUrl") item.new_tab = newTab;
        if (position !== undefined) item.position = position;
        if (indent !== undefined) item.indent = indent;
        const created: any = await canvas.createModuleItem(courseId, moduleId, item);
        return {
          content: [{ type: "text", text: `Added [${created.type}] "${created.title}" (item ID: ${created.id}, position ${created.position}) to module ${moduleId}.` }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to add module item: ${error.message}`);
        }
        throw new Error('Failed to add module item: Unknown error');
      }
    }
  );

  // Tool: delete-module-item
  server.tool(
    "delete-module-item",
    "Remove an item from a module. The page, assignment, or file it points to is not deleted.",
    {
      courseId: z.string().describe("The ID of the course"),
      moduleId: z.string().describe("The ID of the module"),
      itemId: z.string().describe("The ID of the module item (from list-module-items)")
    },
    async ({ courseId, moduleId, itemId }: { courseId: string; moduleId: string; itemId: string }) => {
      try {
        const item: any = await canvas.deleteModuleItem(courseId, moduleId, itemId);
        return {
          content: [{ type: "text", text: `Removed "${item?.title ?? itemId}" from module ${moduleId}.` }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to delete module item: ${error.message}`);
        }
        throw new Error('Failed to delete module item: Unknown error');
      }
    }
  );
} 