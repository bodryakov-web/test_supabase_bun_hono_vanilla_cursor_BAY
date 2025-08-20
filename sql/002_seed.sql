-- Начальные данные: создаём несколько постов и публичные комментарии/лайки
-- Примечание: записи с author_id = null считаются анонимными и не могут редактироваться/удаляться из-за RLS

insert into public.posts (title, body) values
('Привет, мир', 'Первый пост для демо лайков и комментариев'),
('Обновление проекта', 'Мы добавили новые фичи'),
('Вопросы и ответы', 'Задавайте вопросы в комментариях');

-- Anonymous comments (will be readable, but not editable/deletable by RLS since author_id is null)
insert into public.comments (post_id, author_id, author_name, content) values
(1, null, 'Гость', 'Отличная новость!'),
(1, null, 'Сергей', 'Жду продолжения'),
(2, null, 'Мария', 'А где посмотреть список фич?');

-- Anonymous likes (allowed to read, to create likes with RLS required auth)
insert into public.likes (post_id, author_id, author_name) values
(1, null, 'Гость'),
(1, null, 'Иван'),
(2, null, 'Мария');


