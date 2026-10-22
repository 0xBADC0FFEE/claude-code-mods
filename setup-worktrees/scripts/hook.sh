#!/usr/bin/env bash
# WorktreeCreate / WorktreeRemove command hook; reads the hook's JSON on stdin.
# Usage: hook.sh create [setup-script] | hook.sh remove [teardown-script]
set -euo pipefail

readonly WORKTREES_DIR=.worktrees
readonly LOGS_DIR=$WORKTREES_DIR/.logs
readonly BRANCH_PREFIX=worktree-
readonly DIALOG_TITLE="Claude worktree"

main() {
  local action=$1 script=${2:-} input
  if [[ $action == finish-removal ]]; then
    finish_removal "$3" "$4" "$5" "$script"
    return
  fi

  input=$(cat)
  case $action in
    create) create "$(jq -r .cwd <<<"$input")" "$(jq -r .name <<<"$input")" "$script" ;;
    remove) remove "$(jq -r .worktree_path <<<"$input")" "$script" ;;
    *) echo "unknown action: $action" >&2; exit 2 ;;
  esac
}

create() {
  local cwd=$1 name=$2 setup=$3 root worktree
  root=$(repo_root "$cwd")
  worktree=$root/$WORKTREES_DIR/$name

  exclude_worktrees_dir "$root"
  git -C "$root" worktree add -q -b "$BRANCH_PREFIX$name" "$worktree" HEAD >&2
  if [[ -n $setup ]]; then
    local log exit_file
    log=$(log_file "$root" "$name" setup)
    exit_file=$(exit_code_file "$log")
    rm -f "$exit_file"
    run_detached "$worktree" "$log" record_exit_code "$exit_file" run_script "$root" "$worktree" "$setup"
  fi
  echo "$worktree"
}

remove() {
  local worktree teardown=$2 root branch
  worktree=$(cd "$1" && pwd -P)
  root=$(repo_root "$worktree")
  branch=$(git -C "$worktree" rev-parse --abbrev-ref HEAD)
  run_detached "$root" "$(log_file "$root" "$(worktree_name "$root" "$worktree")" teardown)" \
    bash "${BASH_SOURCE[0]}" finish-removal "$teardown" "$root" "$worktree" "$branch"
}

finish_removal() {
  local root=$1 worktree=$2 branch=$3 teardown=$4 dirty commits=0
  dirty=$(git -C "$worktree" status --porcelain | wc -l | tr -d ' ')
  is_own_branch "$branch" && commits=$(unique_commits "$root" "$branch")

  if [[ -n $teardown ]]; then
    run_script "$root" "$worktree" "$teardown" || echo "teardown exited $?"
  fi

  if ((dirty == 0)); then
    git -C "$root" worktree remove --force "$worktree"
    is_own_branch "$branch" || return 0
    if ((commits == 0)) ||
      [[ $(ask "Branch $branch has $commits commit(s) not on any other branch." "Keep branch" "Delete branch") == "Delete branch" ]]; then
      git -C "$root" branch -D "$branch"
    fi
    return 0
  fi

  local message="Worktree $worktree has $dirty uncommitted change(s); branch $branch has $commits unique commit(s)."
  local -a choices=("Keep" "Delete worktree")
  is_own_branch "$branch" && choices+=("Delete worktree and branch")
  case $(ask "$message" "${choices[@]}") in
    "Delete worktree")
      git -C "$root" worktree remove --force "$worktree" ;;
    "Delete worktree and branch")
      git -C "$root" worktree remove --force "$worktree"
      git -C "$root" branch -D "$branch" ;;
  esac
}

repo_root() {
  local common_dir
  common_dir=$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)
  echo "${common_dir%/.git}"
}

exclude_worktrees_dir() {
  local exclude_file=$1/.git/info/exclude entry=/$WORKTREES_DIR/
  mkdir -p "$(dirname "$exclude_file")"
  grep -qxF "$entry" "$exclude_file" 2>/dev/null || echo "$entry" >>"$exclude_file"
}

log_file() {
  local root=$1 name=$2 kind=$3
  mkdir -p "$root/$LOGS_DIR"
  echo "$root/$LOGS_DIR/${name//\//_}.$kind.log"
}

exit_code_file() {
  echo "${1%.log}.exit"
}

record_exit_code() {
  local exit_file=$1 code=0
  shift
  "$@" || code=$?
  # The mod polls this file: a rename never shows it half-written.
  echo "$code" >"$exit_file.tmp"
  mv "$exit_file.tmp" "$exit_file"
}

# The hook's caller waits until every inherited stdio pipe closes, so the
# background job gets stdio of its own.
run_detached() {
  local cwd=$1 log=$2
  shift 2
  (cd "$cwd" && trap '' HUP && "$@" >"$log" 2>&1 </dev/null &)
}

worktree_name() {
  local root=$1 worktree=$2
  echo "${worktree#"$root/$WORKTREES_DIR/"}"
}

run_script() {
  local root=$1 worktree=$2 script=$3
  (
    cd "$worktree"
    WORKTREE_ROOT_PATH=$root WORKTREE_PATH=$worktree WORKTREE_NAME=$(worktree_name "$root" "$worktree") \
      bash -c "$script"
  )
}

is_own_branch() {
  [[ $1 == "$BRANCH_PREFIX"* ]]
}

unique_commits() {
  local root=$1 branch=$2
  git -C "$root" rev-list --count "$branch" --not --exclude="$branch" --branches --remotes
}

ask() {
  local message=$1
  shift
  osascript - "$DIALOG_TITLE" "$message" "$@" <<'APPLESCRIPT'
on run argv
  set answer to display dialog (item 2 of argv) with title (item 1 of argv) buttons (items 3 thru -1 of argv) default button 1
  return button returned of answer
end run
APPLESCRIPT
}

main "$@"
