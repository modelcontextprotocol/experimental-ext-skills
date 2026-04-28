"""Shared plumbing for the Skills-over-MCP client harnesses.

Each harness adds a sys.path shim so this package is importable:

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from _common import evaluate, load_scenario, ...

Per-client: client spawn/embed + tool-call extraction. Shared here:
scenario loading, token/PR resolution, the kind-dispatched evaluator,
banner rendering, and results-JSON writing.
"""

from _common.evaluators import evaluate
from _common.pr import find_review_url, resolve_pr_number
from _common.report import render_report, write_result_json
from _common.scenario import load_scenario, parse_scenario_arg
from _common.setup import report_and_save, setup_run
from _common.tokens import resolve_github_token, resolve_hf_token, skill_name_from_arg

__all__ = [
    "evaluate",
    "find_review_url",
    "load_scenario",
    "parse_scenario_arg",
    "render_report",
    "report_and_save",
    "resolve_github_token",
    "resolve_hf_token",
    "resolve_pr_number",
    "setup_run",
    "skill_name_from_arg",
    "write_result_json",
]
