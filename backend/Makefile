clean:
	@rm -rf ./dist

build: clean
	@node_modules/.bin/babel . -d ./dist --copy-files --no-copy-ignored
	@rm -rf dist/node_modules
# GIT TASKS
pull: ## Pull the current branch
	@git pull origin $$(git branch | grep \* | cut -d ' ' -f2) --rebase

push: ## Push the current branch
	@git push origin $$(git branch | grep \* | cut -d ' ' -f2) --force-with-lease

commit-message: ## Committing the current branch ex: make commit message ---> git commit -m "BRANCH_NAME: message"
	git commit -m "$$(git branch | grep \* | cut -d ' ' -f2): $(filter-out $@,$(MAKECMDGOALS))"
