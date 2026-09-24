import { z } from "zod";
import { CanvasClient } from "../canvasClient.js";

export function registerAssignmentGroupTools(server: any, canvas: CanvasClient) {
  // Tool: list-assignment-groups
  server.tool(
    "list-assignment-groups",
    "List all assignment groups (buckets) in a course.",
    {
      courseId: z.string().describe("The ID of the course")
    },
    async ({ courseId }: { courseId: string }) => {
      try {
        const response = await canvas.listAssignmentGroups(courseId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch assignment groups: ${error.message}`);
        }
        throw new Error('Failed to fetch assignment groups: Unknown error');
      }
    }
  );

  // Tool: create-assignment-group
  server.tool(
    "create-assignment-group",
    "Create a new assignment group (bucket) in a course. All fields optional except courseId.",
    {
      courseId: z.string().describe("The ID of the course"),
      name: z.string().optional(),
      position: z.number().optional(),
      group_weight: z.number().optional(),
      sis_source_id: z.string().optional(),
      integration_data: z.any().optional(),
      rules: z.any().optional()
    },
    async (args: any) => {
      const { courseId, ...fields } = args;
      try {
        // Top-level fields: nesting them under "assignment_group" makes Canvas ignore the name.
        const response = await canvas.createAssignmentGroup(courseId, fields);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to create assignment group: ${error.message}`);
        }
        throw new Error('Failed to create assignment group: Unknown error');
      }
    }
  );

  // Tool: bulk-update-assignment-dates
  server.tool(
    "bulk-update-assignment-dates",
    "Bulk update due/unlock/lock dates for assignments in a course. Omitted dates keep their current value; pass null to clear one. Runs as a background job in Canvas and returns its progress record.",
    {
      courseId: z.string().describe("The ID of the course"),
      assignmentDates: z.array(z.object({
        assignment_id: z.string().describe("The ID of the assignment"),
        due_at: z.string().nullable().optional().describe("New due date (ISO 8601), or null to clear"),
        unlock_at: z.string().nullable().optional().describe("New unlock date (ISO 8601), or null to clear"),
        lock_at: z.string().nullable().optional().describe("New lock date (ISO 8601), or null to clear")
      })).describe("Array of assignment date updates")
    },
    async ({ courseId, assignmentDates }: { courseId: string; assignmentDates: any[] }) => {
      try {
        // Canvas wants a bare JSON array of {id, all_dates: [{base: true, ...}]}. The base entry
        // replaces all three dates, so fill any date the caller left out from the current value.
        const body = [];
        for (const d of assignmentDates) {
          const current: any = await canvas.getAssignment(courseId, d.assignment_id);
          const pick = (k: string) => (d[k] !== undefined ? d[k] : current[k] ?? null);
          body.push({
            id: Number(d.assignment_id),
            all_dates: [{ base: true, due_at: pick('due_at'), unlock_at: pick('unlock_at'), lock_at: pick('lock_at') }]
          });
        }
        const response = await canvas.put(`/api/v1/courses/${courseId}/assignments/bulk_update`, body);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to bulk update assignment dates: ${error.message}`);
        }
        throw new Error('Failed to bulk update assignment dates: Unknown error');
      }
    }
  );

  // Tool: update-assignment-group
  server.tool(
    "update-assignment-group",
    "Rename, reweight, reorder, or change the drop rules of an assignment group.",
    {
      courseId: z.string().describe("The ID of the course"),
      groupId: z.string().describe("The ID of the assignment group"),
      name: z.string().optional(),
      position: z.number().optional(),
      group_weight: z.number().optional(),
      rules: z.any().optional().describe("e.g. { drop_lowest: 1 }; pass {} to clear")
    },
    async (args: any) => {
      const { courseId, groupId, ...fields } = args;
      try {
        const response = await canvas.updateAssignmentGroup(courseId, groupId, fields);
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to update assignment group: ${error.message}`);
        }
        throw new Error('Failed to update assignment group: Unknown error');
      }
    }
  );

  // Tool: delete-assignment-group
  server.tool(
    "delete-assignment-group",
    "Delete an assignment group. Its assignments are deleted with it unless moveAssignmentsTo names another group to move them into.",
    {
      courseId: z.string().describe("The ID of the course"),
      groupId: z.string().describe("The ID of the assignment group to delete"),
      moveAssignmentsTo: z.string().optional().describe("ID of a group to move this group's assignments into first")
    },
    async ({ courseId, groupId, moveAssignmentsTo }: { courseId: string; groupId: string; moveAssignmentsTo?: string }) => {
      try {
        const params = moveAssignmentsTo ? { move_assignments_to: moveAssignmentsTo } : {};
        const response = await canvas.deleteAssignmentGroup(courseId, groupId, params);
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to delete assignment group: ${error.message}`);
        }
        throw new Error('Failed to delete assignment group: Unknown error');
      }
    }
  );
} 