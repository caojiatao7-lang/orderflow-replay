# 首次发布到 GitHub

这是新建的独立仓库，不能改为从私人托管仓库推送。

1. GitHub 登录后新建空仓库 orderflow-replay；可先设 Private。不要初始化 README、LICENSE、.gitignore。
2. 在本项目目录执行：

```sh
node scripts/check-privacy.mjs
git status --short
git remote add origin https://github.com/caojiatao7-lang/orderflow-replay.git
git push -u origin main
```

需使用你自己的GitHub登录凭据。若用户名或仓库名不同，使用GitHub实际提供的远程地址。如果 origin 已存在，先用 git remote -v 核对地址，不要重复添加。

3. 上传后核对文件列表及提交历史：只有源码、文档、测试与synthetic-replay.json；没有真实行情、委托、费用表、压缩包或私有托管配置。
4. 若计划公开和允许他人复用，先确定许可证；当前未选择许可证。

每次提交前检查所有新文件。忽略规则不会移除已跟踪文件；隐私检查只检查常见格式和已知标记，不能保证发现全部敏感内容。
