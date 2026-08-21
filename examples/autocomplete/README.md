# Autocomplete immunization example

Antibody is for AI products, not only chatbots. This synthetic example shows
an autocomplete product preserving a deadline visible on screen.

Input:

```text
Typed prefix: "Yep — I'll send "
Visible message: "Can you send the updated deck after lunch?"
```

Bad output:

```text
"the updated deck tomorrow."
```

The quiz in `quiz.yml` accepts several concise completions. It tests the
behavioral contract: preserve the visible deadline, avoid a contradictory
deadline, respond quickly, and leave the editor text intact.

