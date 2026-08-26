# The Antibody laws

Antibody turns AI product failures into durable immune memory. Discovery finds
and names bad behavior. Immunization reproduces it, fixes it, and leaves an
executable regression quiz behind.

These rules are binding for Antibody's CLI, skills, adapters, and examples:

1. **The human defines the failure.**
2. **Name the observable mistake, not a theory about it.**
3. **A bad trace is evidence—not yet a regression test.**
4. **Reproduce before repairing.**
5. **The known-bad version must fail.**
6. **The candidate must pass without weakening the grader.**
7. **Fix the failure family, not only the original example.**
8. **Use deterministic graders before model judges.**
9. **Private raw evidence stays local; committed fixtures are synthetic or explicitly approved.**
10. **Only a human-reviewed diff can promote a checker or quiz into a blocking gate.**

Detector trust and quiz trust are separate. A detector asks whether a failure
mode can be found across unfamiliar traces. A quiz asks whether one stable,
reproducible case can safely block a merge.
