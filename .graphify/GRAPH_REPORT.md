# Graph Report - .  (2026-09-20)

## Corpus Check
- 4 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 43 nodes · 56 edges · 10 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `JobSearchAutomation` - 9 edges
2. `main()` - 6 edges
3. `main()` - 5 edges
4. `create_master_excel()` - 4 edges
5. `log_message()` - 4 edges
6. `run_job_extraction()` - 4 edges
7. `main()` - 4 edges
8. `acquire_lock()` - 3 edges
9. `create_backup_file()` - 3 edges
10. `load_existing_master()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `acquire_lock()`  [EXTRACTED]
  /Users/srisahithiperiketi/.careeros_runtime/project/find_jobs.py → /Users/srisahithiperiketi/.careeros_runtime/project/find_jobs.py  _Bridges community 2 → community 8_
- `main()` --calls--> `create_master_excel()`  [EXTRACTED]
  /Users/srisahithiperiketi/.careeros_runtime/project/find_jobs.py → /Users/srisahithiperiketi/.careeros_runtime/project/find_jobs.py  _Bridges community 2 → community 3_
- `main()` --calls--> `JobSearchAutomation`  [EXTRACTED]
  /Users/srisahithiperiketi/.careeros_runtime/project/main.py → /Users/srisahithiperiketi/.careeros_runtime/project/main.py  _Bridges community 1 → community 4_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.39
Nodes (7): get_next_run_time(), log_message(), main(), Log message to both console and file, Find the next scheduled run time from RUN_TIMES., Execute find_jobs.py and capture result, run_job_extraction()

### Community 1 - "Community 1"
Cohesion: 0.38
Nodes (6): check_status(), main(), print_help(), Print help information., Check configuration status., Main entry point with command handling.

### Community 2 - "Community 2"
Cohesion: 0.6
Nodes (4): load_existing_master(), main(), Load existing master file. ABORTS on error to prevent data loss., release_lock()

### Community 3 - "Community 3"
Cohesion: 0.5
Nodes (4): create_backup_file(), create_master_excel(), Create a backup of the master file before writing., Create Excel with formatting and dropdown. Creates backup first.

### Community 4 - "Community 4"
Cohesion: 0.5
Nodes (3): JobSearchAutomation, Main automation class that orchestrates the job search workflow.     Uses AirLLM, Initialize the automation with configuration from settings

### Community 5 - "Community 5"
Cohesion: 0.5
Nodes (2): Run all configured batches., Validate that all required configuration is present.

### Community 6 - "Community 6"
Cohesion: 0.5
Nodes (2): Initialize all automation components if not already initialized., Run a single batch of job search and evaluation.                  Args:

### Community 7 - "Community 7"
Cohesion: 0.67
Nodes (1): # IMPORTANT: main.py currently writes to outputs/role_name/job...xlsx

### Community 8 - "Community 8"
Cohesion: 1
Nodes (2): acquire_lock(), Acquire file lock to prevent concurrent writes.

### Community 9 - "Community 9"
Cohesion: 1
Nodes (1): Save job description to file for reference.

## Knowledge Gaps
- **18 isolated node(s):** `Acquire file lock to prevent concurrent writes.`, `Create a backup of the master file before writing.`, `Load existing master file. ABORTS on error to prevent data loss.`, `Create Excel with formatting and dropdown. Creates backup first.`, `Main automation class that orchestrates the job search workflow.     Uses AirLLM` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 8`** (2 nodes): `acquire_lock()`, `Acquire file lock to prevent concurrent writes.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (2 nodes): `.save_job_description()`, `Save job description to file for reference.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `JobSearchAutomation` connect `Community 4` to `Community 1`, `Community 5`, `Community 6`, `Community 9`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 1` to `Community 4`, `Community 6`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `Acquire file lock to prevent concurrent writes.`, `Create a backup of the master file before writing.`, `Load existing master file. ABORTS on error to prevent data loss.` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._