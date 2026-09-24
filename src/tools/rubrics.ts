import { z } from "zod";
import { CanvasClient } from "../canvasClient.js";
import { Rubric, RubricStat } from "../types.js";
import { calculateMedian } from "../rubricUtils.js";

export function registerRubricTools(server: any, canvas: CanvasClient) {
  // Tool: list-rubrics
  server.tool(
    "list-rubrics",
    "List all rubrics for a specific course",
    {
      courseId: z.string().describe("The ID of the course")
    },
    async ({ courseId }: { courseId: string }) => {
      try {
        const rubrics = (await canvas.listRubrics(courseId) as any) as Rubric[];
        const formattedRubrics = rubrics.map((rubric: Rubric) => 
          `Rubric: ${rubric.title}\nID: ${rubric.id}\nDescription: ${rubric.description || 'No description'}\n---`
        ).join('\n');
        return {
          content: [
            {
              type: "text",
              text: formattedRubrics || "No rubrics found for this course",
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch rubrics: ${error.message}`);
        }
        throw new Error('Failed to fetch rubrics: Unknown error');
      }
    }
  );

  // Tool: get-rubric-statistics
  server.tool(
    "get-rubric-statistics",
    "Get statistics for rubric assessments on an assignment",
    {
      courseId: z.string().describe("The ID of the course"),
      assignmentId: z.string().describe("The ID of the assignment"),
      includePointDistribution: z.boolean().default(true).describe("Whether to include point distribution for each criterion")
    },
    async ({ courseId, assignmentId, includePointDistribution = true }: { courseId: string; assignmentId: string; includePointDistribution?: boolean }) => {
      try {
        const response = (await canvas.getRubricStatistics(courseId, assignmentId, {
          include: ['rubric']
        }) as any);
        if (!response.rubric) {
          throw new Error('No rubric found for this assignment');
        }

        const submissions = await canvas.fetchAllPages(
          // Note: fetchAllPages still uses a direct URI. This could be refactored further
          // by adding specific fetchAll methods to CanvasClient if desired.
          `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
          {
            params: {
              include: ['rubric_assessment'],
              per_page: 100
            }
          }
        );

        const rubricStats = (response.rubric as any[]).map((criterion: any) => {
          const scores = submissions
            .filter((sub: any) => sub.rubric_assessment?.[criterion.id]?.points !== undefined)
            .map((sub: any) => sub.rubric_assessment[criterion.id].points);
          const stats: RubricStat = {
            id: criterion.id,
            description: criterion.description,
            points_possible: criterion.points,
            total_assessments: scores.length,
            average_score: 0,
            median_score: 0,
            min_score: 0,
            max_score: 0
          };
          if (scores.length > 0) {
            stats.average_score = Number((scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2));
            stats.median_score = calculateMedian(scores);
            stats.min_score = Math.min(...scores);
            stats.max_score = Math.max(...scores);
          }
          if (includePointDistribution) {
            const distribution: { [key: number]: number } = {};
            scores.forEach((score: number) => {
              distribution[score] = (distribution[score] || 0) + 1;
            });
            stats.point_distribution = distribution;
          }
          return stats;
        });
        // Calculate overall statistics
        const totalScores = submissions
          .filter((sub: any) => sub.rubric_assessment)
          .map((sub: any) => {
            return Object.values(sub.rubric_assessment)
              .reduce((sum: number, assessment: any) => sum + (assessment.points || 0), 0);
          });
        const overallStats = {
          total_submissions: submissions.length,
          submissions_with_assessment: totalScores.length,
          overall_average: 0,
          overall_median: 0,
          overall_min: 0,
          overall_max: 0
        };
        if (totalScores.length > 0) {
          overallStats.overall_average = Number((totalScores.reduce((a, b) => a + b, 0) / totalScores.length).toFixed(2));
          overallStats.overall_median = calculateMedian(totalScores);
          overallStats.overall_min = Math.min(...totalScores);
          overallStats.overall_max = Math.max(...totalScores);
        }
        const formattedStats = [
          'Overall Statistics:',
          `Total Submissions: ${overallStats.total_submissions}`,
          `Submissions with Assessment: ${overallStats.submissions_with_assessment}`,
          `Average Score: ${overallStats.overall_average}`,
          `Median Score: ${overallStats.overall_median}`,
          `Min Score: ${overallStats.overall_min}`,
          `Max Score: ${overallStats.overall_max}`,
          '\nCriterion Statistics:',
          ...rubricStats.map((stat: any) => {
            const parts = [
              `\nCriterion: ${stat.description}`,
              `Points Possible: ${stat.points_possible}`,
              `Total Assessments: ${stat.total_assessments}`,
              `Average Score: ${stat.average_score}`,
              `Median Score: ${stat.median_score}`,
              `Min Score: ${stat.min_score}`,
              `Max Score: ${stat.max_score}`
            ];
            if (includePointDistribution && stat.point_distribution) {
              parts.push('\nPoint Distribution:');
              Object.entries(stat.point_distribution)
                .sort(([a], [b]) => Number(b) - Number(a))
                .forEach(([score, count]) => {
                  const percentage = (((count as number) / stat.total_assessments) * 100).toFixed(1);
                  parts.push(`  ${score} points: ${count} submissions (${percentage}%)`);
                });
            }
            return parts.join('\n');
          })
        ].join('\n');
        return {
          content: [
            {
              type: "text",
              text: formattedStats
            }
          ]
        };
      } catch (error: any) {
        if (error.response?.status === 404) {
          throw new Error(`Assignment ${assignmentId} not found in course ${courseId}`);
        }
        if (error.response?.errors) {
          throw new Error(`Failed to fetch rubric statistics: ${JSON.stringify(error.response.errors)}`);
        }
        throw new Error(`Failed to fetch rubric statistics: ${error.message}`);
      }
    }
  );

  // Tool: list-rubric-assessments
  server.tool(
    "list-rubric-assessments",
    "List all rubric assessments for an assignment.",
    {
      courseId: z.string().describe("The ID of the course"),
      assignmentId: z.string().describe("The ID of the assignment"),
      anonymous: z.boolean().default(true).describe("Whether to anonymize student names and emails (default: true for privacy)")
    },
    async ({ courseId, assignmentId, anonymous = true }: { courseId: string; assignmentId: string; anonymous?: boolean }) => {
      try {
        const rubricAssessments = (await canvas.listRubricAssessments(courseId, assignmentId, { 'include[]': 'rubric_assessment' }, { anonymous }) as any[]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rubricAssessments, null, 2)
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch rubric assessments: ${error.message}`);
        }
        throw new Error('Failed to fetch rubric assessments: Unknown error');
      }
    }
  );

  // Tool: create-rubric
  server.tool(
    "create-rubric",
    "Create a rubric for a course, optionally attaching it to an assignment",
    {
      courseId: z.string().describe("The ID of the course"),
      title: z.string().describe("The title of the rubric"),
      criteria: z.array(z.object({
        description: z.string().describe("Criterion description"),
        longDescription: z.string().optional().describe("Longer explanation of the criterion"),
        points: z.number().describe("Maximum points for this criterion"),
        ratings: z.array(z.object({
          description: z.string().describe("Rating level description"),
          longDescription: z.string().optional().describe("Longer explanation of this rating level"),
          points: z.number().describe("Points for this rating level")
        })).describe("Rating levels for this criterion")
      })).describe("Array of rubric criteria with their ratings"),
      assignmentId: z.string().optional().describe("If provided, attach the rubric to this assignment"),
      useForGrading: z.boolean().default(false).describe("Whether to use this rubric for grading"),
      freeFormComments: z.boolean().default(true).describe("Whether to allow free-form comments")
    },
    async ({ courseId, title, criteria, assignmentId, useForGrading, freeFormComments }: {
      courseId: string; title: string; criteria: any[]; assignmentId?: string;
      useForGrading?: boolean; freeFormComments?: boolean;
    }) => {
      try {
        // Transform criteria array into Canvas's indexed hash format
        const criteriaHash: any = {};
        criteria.forEach((criterion, i) => {
          const ratingsHash: any = {};
          criterion.ratings.forEach((rating: any, j: number) => {
            ratingsHash[String(j)] = {
              description: rating.description,
              long_description: rating.longDescription || "",
              points: rating.points
            };
          });
          criteriaHash[String(i)] = {
            description: criterion.description,
            long_description: criterion.longDescription || "",
            points: criterion.points,
            ratings: ratingsHash
          };
        });

        const rubricData: any = {
          title,
          criteria: criteriaHash,
          free_form_criterion_comments: freeFormComments !== false ? "1" : "0"
        };

        let associationData: any = undefined;
        if (assignmentId) {
          associationData = {
            association_id: assignmentId,
            association_type: "Assignment",
            use_for_grading: useForGrading ? true : false,
            purpose: "grading"
          };
        }

        const result = await canvas.createRubric(courseId, rubricData, associationData);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to create rubric: ${error.message}`);
        }
        throw new Error('Failed to create rubric: Unknown error');
      }
    }
  );

  // Tool: update-rubric
  server.tool(
    "update-rubric",
    "Update an existing rubric's title and/or criteria",
    {
      courseId: z.string().describe("The ID of the course"),
      rubricId: z.string().describe("The ID of the rubric to update"),
      title: z.string().optional().describe("New title for the rubric"),
      criteria: z.array(z.object({
        description: z.string().describe("Criterion description"),
        longDescription: z.string().optional().describe("Longer explanation of the criterion"),
        points: z.number().describe("Maximum points for this criterion"),
        ratings: z.array(z.object({
          description: z.string().describe("Rating level description"),
          longDescription: z.string().optional().describe("Longer explanation of this rating level"),
          points: z.number().describe("Points for this rating level")
        })).describe("Rating levels for this criterion")
      })).optional().describe("New criteria array (replaces existing criteria)")
    },
    async ({ courseId, rubricId, title, criteria }: {
      courseId: string; rubricId: string; title?: string; criteria?: any[];
    }) => {
      try {
        const rubricData: any = {};
        if (title) rubricData.title = title;
        if (criteria) {
          const criteriaHash: any = {};
          criteria.forEach((criterion, i) => {
            const ratingsHash: any = {};
            criterion.ratings.forEach((rating: any, j: number) => {
              ratingsHash[String(j)] = {
                description: rating.description,
                long_description: rating.longDescription || "",
                points: rating.points
              };
            });
            criteriaHash[String(i)] = {
              description: criterion.description,
              long_description: criterion.longDescription || "",
              points: criterion.points,
              ratings: ratingsHash
            };
          });
          rubricData.criteria = criteriaHash;
        }

        const result = await canvas.updateRubric(courseId, rubricId, rubricData);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to update rubric: ${error.message}`);
        }
        throw new Error('Failed to update rubric: Unknown error');
      }
    }
  );

  // Tool: attach-rubric-to-assignment
  server.tool(
    "attach-rubric-to-assignment",
    "Attach a rubric to an assignment.",
    {
      courseId: z.string().describe("The ID of the course"),
      assignmentId: z.string().describe("The ID of the assignment"),
      rubricId: z.string().describe("The ID of the rubric to attach")
    },
    async ({ courseId, assignmentId, rubricId }: { courseId: string; assignmentId: string; rubricId: string }) => {
      try {
        const result = await canvas.attachRubricToAssignment(courseId, assignmentId, rubricId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to attach rubric: ${error.message}`);
        }
        throw new Error('Failed to attach rubric: Unknown error');
      }
    }
  );
} 