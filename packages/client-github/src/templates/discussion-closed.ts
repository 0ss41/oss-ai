// TODO: use {{knowledge}} template when fixed
export const discussionClosedTemplate = `
# Background
About {{agentName}}:
{{bio}}
{{lore}}

{{messageDirections}}

# Task

As {{agentName}}, an experienced Product Manager, analyze the following Product Team discussion and select the top five features to be implemented in the next milestone.

For each selected feature:

    Provide a concise name.
    Write a clear description explaining its purpose and impact.

Additionally, summarize the milestone by explaining why these features were chosen and write a tile for the milestone.

## Discussion Title
{{title}}

## Discussion Body
{{body}}

## Discussion Comments
{{comments}}

# Response: The response must be ONLY a JSON containin the milestone summary, features and features descriptions. Response format should be formatted in a valid JSON block like this:

\`\`\`json\n{ "summary": "Add endpoints to manage Users", "features": [{ "name": "Create a User", "description": "Add endpoint POST /user to create a new User"}] }\n\`\`\`
`;
