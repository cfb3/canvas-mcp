import { z } from "zod";
import { readFileSync } from "fs";
import { CanvasClient } from "../canvasClient.js";
import { Course, Rubric } from "../types.js";

export function registerCourseTools(server: any, canvas: CanvasClient) {
  // Tool: list-courses
  server.tool(
    "list-courses",
    "List all courses for the authenticated user. Unpublished courses (e.g. next quarter's, before it opens) are hidden unless includeUnpublished is true.",
    {
      includeUnpublished: z.boolean().default(false).describe("Also list courses that are not yet published")
    },
    async ({ includeUnpublished }: { includeUnpublished?: boolean }) => {
      try {
        const states = includeUnpublished ? ['available', 'unpublished'] : ['available'];
        const courses: Course[] = (await canvas.listCourses({
          ...(includeUnpublished ? {} : { enrollment_state: 'active' }),
          state: states,
          per_page: 100,
          include: ['term']
        }) as any) as Course[];
        const formattedCourses = courses
          .filter(course => states.includes(course.workflow_state as string))
          .map((course: Course) => {
            const termInfo = course.term ? ` (${course.term.name})` : '';
            const unpub = course.workflow_state === 'unpublished' ? ' [UNPUBLISHED]' : '';
            return `Course: ${course.name}${termInfo}${unpub}\nID: ${course.id}\nCode: ${course.course_code}\n---`;
          })
          .join('\n');
        return {
          content: [
            {
              type: "text",
              text: formattedCourses ?
                `Available Courses:\n\n${formattedCourses}` :
                "No active courses found.",
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch courses: ${error.message}`);
        }
        throw new Error('Failed to fetch courses: Unknown error');
      }
    }
  );

  // Tool: post-announcement
  server.tool(
    "post-announcement",
    "Post an announcement to a specific course",
    {
      courseId: z.string().describe("The ID of the course"),
      title: z.string().describe("The title of the announcement"),
      message: z.string().describe("The content of the announcement")
    },
    async ({ courseId, title, message }: { courseId: string; title: string; message: string }) => {
      try {
        await canvas.postAnnouncement(courseId, {
          title,
          message,
          is_announcement: true,
        });
        return {
          content: [
            {
              type: "text",
              text: `Successfully posted announcement "${title}" to course ${courseId}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to post announcement: ${error.message}`);
        }
        throw new Error('Failed to post announcement: Unknown error');
      }
    }
  );

  // Tool: get-syllabus
  server.tool(
    "get-syllabus",
    "Read the HTML body of a course's Syllabus tab. This lives on the course record, not on a wiki page.",
    {
      courseId: z.string().describe("The ID of the course")
    },
    async ({ courseId }: { courseId: string }) => {
      try {
        const course: any = await canvas.getCourse(courseId, { 'include[]': 'syllabus_body' });
        const body = course.syllabus_body || '';
        return {
          content: [{
            type: "text",
            text: `Syllabus for ${course.name} (${courseId}), ${body.length} characters:\n\n${body || '(empty)'}`
          }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch syllabus: ${error.message}`);
        }
        throw new Error('Failed to fetch syllabus: Unknown error');
      }
    }
  );

  // Tool: update-syllabus
  server.tool(
    "update-syllabus",
    "Replace the HTML body of a course's Syllabus tab. Overwrites the whole syllabus; read it first with get-syllabus if you need to keep anything.",
    {
      courseId: z.string().describe("The ID of the course"),
      syllabusBody: z.string().optional().describe("The complete new syllabus HTML"),
      syllabusFile: z.string().optional().describe("Absolute path to a local HTML file to use as the syllabus body, instead of syllabusBody")
    },
    async ({ courseId, syllabusBody, syllabusFile }: { courseId: string; syllabusBody?: string; syllabusFile?: string }) => {
      try {
        if ((syllabusBody === undefined) === (syllabusFile === undefined)) {
          throw new Error('Pass exactly one of syllabusBody or syllabusFile');
        }
        if (syllabusFile !== undefined) {
          syllabusBody = readFileSync(syllabusFile, 'utf-8');
        }
        const course: any = await canvas.updateCourse(courseId, { syllabus_body: syllabusBody });
        return {
          content: [{
            type: "text",
            text: `Updated the syllabus of ${course.name} (${courseId}): ${syllabusBody!.length} characters written.`
          }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to update syllabus: ${error.message}`);
        }
        throw new Error('Failed to update syllabus: Unknown error');
      }
    }
  );
} 