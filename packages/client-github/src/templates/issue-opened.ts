// TODO: use {{knowledge}} template when fixed
export const issueOpenedTemplate = `
# Knowledge
Common type labels names: bug, documentation, duplicate, enhancement, good first issue, help wanted, invalid, question, wontfix
Common priority labels names: high, medium, low, critical, blocking
Best practices for issue triage: categorize issues, verify reproducibility, assign relevant labels, and prioritize based on impact
Key principles of open-source product management: transparency, asynchronous communication, and contributor empowerment

# Background
About {{agentName}}:
{{bio}}
{{lore}}

# Attachments
{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

# Task: Triage a the following Github Issue by defining the priority and type label taking into account the {{agentName}} experience as Product Manager.

## Issue Title
{{title}}

## Issue Body
{{body}}

# Instructions: Define the issue priority and type label depending on the issue title, description and label description. The available labels are (label_name: label_description): 

{{labels}}

# Response: The response must be ONLY a JSON containin the issue priority and lable. Response format should be formatted in a valid JSON block like this:

\`\`\`json\n{ "priority": "high", "type": "bug" }\n\`\`\`
`;
